---
'@readonly-mcp/server': patch
---

git blame accepts only allowlisted options, each by its full name: those `git blame -h` lists, except the file readers `--contents`, `-S` and `--ignore-revs-file`, and the rev-list options blame's manual documents (`--reverse`, `--first-parent`, `--date`, `--encoding`, `--since`, `--after`, `--until`, `--before`). It rejects every other option, so a file-reading flag git adds later is rejected until someone allows it.
