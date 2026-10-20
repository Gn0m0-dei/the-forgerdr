#!/usr/bin/env bash
# PostToolUse for Write, Edit and MultiEdit: removes invisible Unicode from the written file and tells the
# agent what was removed. Skips binaries and invalid UTF-8.
set -euo pipefail

path="$(jq -r '.tool_input.file_path // empty')"
[ -n "$path" ] && [ -f "$path" ] || exit 0

report="$(perl -CS -MEncode -e '
  my $path = shift;
  open my $in, "<:raw", $path or exit 0;
  local $/; my $bytes = <$in>; close $in;
  exit 0 if index($bytes, "\0") >= 0;
  my $text = eval { decode("UTF-8", $bytes, Encode::FB_CROAK) }; exit 0 unless defined $text;
  my $always = qr/[\x{200B}\x{2060}-\x{2064}\x{200E}\x{200F}\x{061C}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{E0000}-\x{E007F}\x{00AD}\x{180E}\x{034F}]/;
  my $bom = ($text =~ s/\A\x{FEFF}//) ? "\x{FEFF}" : "";
  my (%removed, $n, @out);
  for my $line (split /(?<=\n)/, $text) {
    $n++;
    $line =~ s/($always|\x{FEFF})/push @{$removed{sprintf "U+%04X", ord $1}}, $n; ""/ge;
    push @out, $line;
  }
  if (%removed) {
    open my $o, "+<:raw", $path or exit 0; truncate $o, 0; seek $o, 0, 0;
    print $o encode("UTF-8", $bom . join "", @out); close $o;
  }
  my $lines = sub { my @l = @{$_[0]}; my $more = @l > 5 ? " +" . (@l - 5) : ""; splice @l, 5; (@l > 1 ? "lines " : "line ") . join(", ", @l) . $more };
  my @parts = map { "$_ (" . $lines->($removed{$_}) . ")" } sort keys %removed;
  print "forgerdr scrub: $path: removed " . join(", ", @parts) . "." if @parts;
' "$path")"

[ -n "$report" ] || exit 0
jq -nc --arg context "$report" '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$context}}'
