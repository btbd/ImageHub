## ImageHub

An alternative front-end search for Docker containers.

## Features

- Searching by namespace and queries
- Sorting and filters for search refining
- Simple and compact UI

## Usage

- Use the top options bar to set search parameters
- Click the + next to a result to show the tags
- Click on a tag's `y` to view its possible architecture variants or operating system versions

## Request Usage

To retrieve raw JSON data, use: `host/search?`

With possible query parameters:

- `q`
	- `query (string)` - The search string to look for
- `n`
	- `namespace (string)` - The namespace of the results
- `p`
	- `page (int)` - The page number
- `arch`
	- `architecture (string,...)` - The architecture(s) that results must contain at least one of
- `os`
	- `operating system (string,...)` - The operating system(s) that results must contain at least one of 
		
For example, `host/search?n=library&q=liberty` will get all results under the namespace `library` (AKA  official) that match the query `liberty`.