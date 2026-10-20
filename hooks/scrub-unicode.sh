#!/usr/bin/env bash
# PostToolUse for Write, Edit and MultiEdit: removes invisible Unicode from the written file and tells the
# agent what was removed and which exotic spaces were left alone. Skips binaries and invalid UTF-8.
set -euo pipefail

path="$(jq -r '.tool_input.file_path // empty')"
[ -n "$path" ] && [ -f "$path" ] || exit 0

report="$(perl -CSA -MCwd=abs_path -MFile::Temp=tempfile -e '
  my $path = shift;
  my $max_lines = 5;
  open my $in, "<:raw", $path or exit 0;
  local $/; my $bytes = <$in>; close $in;
  exit 0 if index($bytes, "\0") >= 0;
  my $text = $bytes; exit 0 unless utf8::decode($text);
  my $always = qr/[\x{200B}\x{2060}-\x{2064}\x{200E}\x{200F}\x{061C}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{E0000}-\x{E007F}\x{00AD}\x{180E}\x{034F}]/;
  my $joiner = qr/[\x{200C}\x{200D}]/;
  my $space = qr/[\x{00A0}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}\x{1680}]/;
  exit 0 unless $text =~ /$always|\x{FEFF}|$joiner|$space/;
  my $bom = ($text =~ s/\A\x{FEFF}//) ? "\x{FEFF}" : "";
  my (%removed, %kept, $n, @out);
  my $note = sub { my ($h, $c) = @_; my $l = $h->{sprintf "U+%04X", ord $c} //= []; push @$l, $n unless @$l && $l->[-1] == $n };
  for my $line (split /(?<=\n)/, $text) {
    $n++;
    $line =~ s/($always|\x{FEFF})/$note->(\%removed, $1); ""/ge;
    # Joiners are legitimate inside emoji sequences and Indic or Persian text: only strip a run between ASCII.
    $line =~ s/(?<![^\x00-\x7F])($joiner+)(?![^\x00-\x7F])/$note->(\%removed, $_) for split "", $1; ""/ge;
    $note->(\%kept, $1) while $line =~ /($space)/g;
    push @out, $line;
  }
  my $lines = sub { my @l = @{$_[0]}; my $more = @l > $max_lines ? " +" . (@l - $max_lines) : ""; splice @l, $max_lines; (@l > 1 ? "lines " : "line ") . join(", ", @l) . $more };
  my $list = sub { my %h = %{$_[0]}; join ", ", map { "$_ (" . $lines->($h{$_}) . ")" } sort keys %h };
  my @parts;
  if (%removed) {
    # Written next to the target and renamed over it, so a failed write never leaves the file half-written.
    # The rename replaces the inode: a symlink survives because its resolved target is what gets replaced,
    # while hard links and extended attributes do not follow.
    my $target = abs_path($path);
    my ($dir) = $target =~ m{^(.*)/};
    my $tmp_path;
    $SIG{TERM} = sub { exit 1 };
    my $written = eval {
      my @st = stat $target or die "cannot stat the file: $!\n";
      my $tmp;
      ($tmp, $tmp_path) = eval { tempfile(".scrub-XXXXXX", DIR => $dir, UNLINK => 1) } or die "cannot create a temporary file in $dir: $!\n";
      binmode $tmp, ":raw";
      my $output = $bom . join "", @out; utf8::encode($output);
      print {$tmp} $output or die "write failed: $!\n";
      close $tmp or die "write failed: $!\n";
      chmod $st[2] & 07777, $tmp_path or die "chmod failed: $!\n";
      rename $tmp_path, $target or die "rename failed: $!\n";
      1;
    };
    unlink $tmp_path if !$written && defined $tmp_path;
    (my $why = $@ // "") =~ s/\s+\z//;
    push @parts, ($written ? "removed " : "could not write the file ($why); still contains ") . $list->(\%removed);
  }
  push @parts, "kept " . $list->(\%kept) . ": use an escape such as \\u00a0 or &nbsp; if intended" if %kept;
  print "forgerdr scrub: $path: " . join("; ", @parts) . "." if @parts;
' "$path")"

[ -n "$report" ] || exit 0
jq -nc --arg context "$report" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$context}}'
