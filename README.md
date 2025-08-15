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
- [x] really basic RAG indexing and searching on some basic files

### In Progress

- [ ] add RAG + web tool

### Todo

- [ ] create more permanent opensearch db to use
- [ ] firm up the autoindexer "cron?"
- [ ] openai compat instead of ollama to prep from move off to (vllm, llama.cpp, or aphrodite engine)
- [ ] reddit comment parsing (configurable levels deep and limit the total of 10 comments per thread)...though semantic parsing would be cool...as would using cheap vector searches and bm25 to quickly determine a potential relevance
- [ ] fix prod package tracker not taking screenshots because browser process won't start
- [ ] opensearch for rag instead of silly jsonfile-backed storage
- [ ] long scraping times should be aborted or some other/better UI/UX feedback should be employed
- [ ] Fix ghetto weather location lookups (no default)
- [ ] Notes archive first embeddings
- [ ] youtube summarizer (yt-dlp-> ffmpeg>8.0?)

### Extra

- [ ] home automation commands and queries
- [ ] Deeper Researcher
- [ ] move the ui over or merge projects?
- [ ] for advanced scraping, consider using python libraries or porting it over to node.jss
- [ ] Control Navidrome via Subsonic to play certain music based on moods and time of day
  - part of that is the music genre analysis, tagging, and classification
- [ ] Resume builder based on pasted job descriptions
- [ ] Shodan search API for fun
- [ ] translate subs from a file to another language
- [ ] Music identification and sorting
- [ ] General File organization proposals (non-destructive proposals)
- [ ] Notification filtering:
  - external systems like news or updates notifiying me of things I care about or not
  - could be rss or songs
