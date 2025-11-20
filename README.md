# aetherium-nexus-mcp-server

## Overview

My collection of MCP tools

### Done

- [x] Configuration
- [x] Docker pushing
- [x] Logging
- [x] Time tool (what did I mean by this)
- [x] Web search (searxng)
- [x] More complex weather forecast tool (as in tomorrow)
- [x] Improve logging (not so noisy on weather)
- [x] basic package tracker
- [x] deploy
- [x] React front end?
- [x] basic website scraper and summarizer
- [x] improve accuracy of package screenshots? perhaps reduce viewport size
- [x] search results sometimes return nothing useful
- [x] basic reddit-specific scraping by adding .json to the end of the thread
- [x] make scraper more modular with fallbacks
- [x] Web scraping building results returns the normal results without wrapping in ToolCallResult
- [x] basic opensearch integration
- [x] RAG - basic indexing and searching on some files
- [x] RAG - basic opensearch support
- [x] Fix ghetto weather location lookups (no default)
- [x] long scraping times should be aborted (via signals/timeouts) or some other/better UI/UX feedback should be employed
- [x] abort signal passed in from tool call
- [x] native TS on node

### In Progress

- [ ] reddit comment parsing (configurable levels deep and limit the total of 10 comments per thread)

### todo

- [ ] fix prod package tracker not taking screenshots because browser process won't start
- [ ] youtube downloader (yt-dlp)
- [ ] youtube transcription (yt-dlp -> ffmpeg 8.0+ or whisper)

### Upcoming

- [ ] RAG - finish up simple RAG + web search (need usability tests to determine usefulness)
- [ ] RAG - indexer "cron?"
- [ ] openai compat instead of ollama to prep from move off to (vllm, llama.cpp, or aphrodite)
- [ ] OpenAPI for tools
- [ ] phone number lookup (first OSINT tooling)
- [ ] How might a Researcher work?
- [ ] move the ui over or merge projects?
- [ ] for advanced scraping, consider using python libraries or porting it over to node.jss
- [ ] Control Navidrome via Subsonic to play certain music based on moods and time of day
  - part of that is the music genre analysis, tagging, and classification
- [ ] Resume builder based on pasted job descriptions
- [ ] OSINT - Shodan search API for fun
- [ ] MEDIA - translate subs from a file to another language
- [ ] MEDIA - Music identification and sorting
- [ ] LIFE - General File organization proposals (non-destructive proposals)
- [ ] LIFE - Notification filtering:
  - external systems like news or updates notifiying me of things I care about or not
  - could be rss or songs
