## ImageHub

An alternative front-end search for Docker containers.

## Features

- Searching by namespace and queries
- Quick sorting and filters for search refining
- Simple and compact UI

## Request Usage

To retrieve raw JSON data, use: `host/search?`

With possible query parameters:

- `q`
	- `query (string)` - The search string to look for
- `n`
	- `namespace (string)` - The namespace of the results
- `s`
	- `page_size (int)` - The amount of results per page (default 100)
- `p`
	- `page (int)` - The page number
- `r`
	- `order (string)` - The order of the results
		- `"star_count"` - Ascending star count
		- `"-star_count"` - Descending star count
		- `"pull_count"` - Ascending pull count
		- `"-pull_count"` - Descending pull count
- `o`
	- `official (int)` - The build must (`o=1`) or must not (`o=0`) be official
- `a`
	- `automated (int)` - The build must (`a=1`) or must not (`a=0`) be automated
		
For example, `host/search?n=library&q=liberty` will get all results under the namespace `library` (AKA  official) that match the query `liberty`.

## TODO

- Repository page
- Namespace and repository configuration