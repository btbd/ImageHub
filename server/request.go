package main

import (
	"encoding/json"
	"io/ioutil"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// Used to handle data retrieved about a namespace repo from dockerhub
type NamespaceRepository struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Type         string `json:"type"`
	Status       int    `json:"status"`
	Description  string `json:"description"`
	Is_automated bool   `json:"is_automated"`
	Is_private   bool   `json:"is_private"`
	Is_official  bool   `json:"is_official"`
	Star_count   int    `json:"star_count"`
	Pull_count   int    `json:"pull_count"`
	Last_updated string `json:"last_updated"`
}

// Used to handle search data retrieved about a repo from dockerhub
type QueryRepository struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Description  string `json:"description"`
	Is_automated bool   `json:"is_automated"`
	Is_official  bool   `json:"is_official"`
	Star_count   int    `json:"star_count"`
	Pull_count   int    `json:"pull_count"`
}

func handleFileRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	addLog(r)

	bytes, err := ioutil.ReadFile(web_path + r.URL.Path[1:])
	if err == nil {
		w.Write(bytes)
	} else {
		bytes, err := ioutil.ReadFile(web_path + "index.html")
		if err == nil {
			w.Write(bytes)
		} else {
			w.Write([]byte("404: \"" + r.URL.Path[1:] + "\" not found\n"))
		}
	}
}

func handleSearchRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	addLog(r)

	w.Header().Set("Content-Type", "application/json")

	query := strings.ToLower(r.FormValue("q"))
	namespace := strings.ToLower(r.FormValue("n"))
	page_size, _ := strconv.Atoi(r.FormValue("s"))
	page, _ := strconv.Atoi(r.FormValue("p"))
	order := r.FormValue("r")

	// -1 = either, 0 = not official, 1 = official
	official := -1
	if o := r.FormValue("o"); len(o) != 0 {
		if o == "1" {
			official = 1
		} else {
			official = 0
		}
	}

	// -1 = either, 0 = not automated, 1 = automated
	automated := -1
	if a := r.FormValue("a"); len(a) != 0 {
		if a == "1" {
			automated = 1
		} else {
			automated = 0
		}
	}

	if page_size < 1 {
		page_size = 100
	}

	if page < 0 {
		page = 0
	}

	// Namespace search
	if len(namespace) != 0 {
		var repos []NamespaceRepository
		start := page * page_size
		end := start + page_size
		is_official := namespace == "library"

		// Quick check for 0 results
		if !(official == 1 && automated == 1) && !(official == 0 && is_official) && (official != 1 || is_official) {
			bytes := cacheGetURL("https://hub.docker.com/v2/repositories/" + namespace + "?page_size=1&page=1")
			if len(bytes) > 0 {
				var data map[string]interface{}
				err := json.Unmarshal(bytes, &data)
				if err == nil && data["count"] != nil && int(data["count"].(float64)) > 0 {
					count := int(math.Ceil(data["count"].(float64) / 50))

					var repos_mu sync.Mutex
					var wait sync.WaitGroup

					for i := 1; i <= count; i++ {
						wait.Add(1)
						go getNamespaceRepos(&wait, "https://hub.docker.com/v2/repositories/"+namespace+"?page_size=50&page="+strconv.Itoa(i), &repos, &repos_mu, query, automated, is_official)
					}
						
					wait.Wait()
							
					switch order {
						case "star_count":
							sort.Slice(repos, func(a, b int) bool {
								return repos[a].Star_count > repos[b].Star_count
							})
							break
						case "-star_count":
							sort.Slice(repos, func(a, b int) bool {
								return repos[a].Star_count < repos[b].Star_count
							})
							break
						case "pull_count":
							sort.Slice(repos, func(a, b int) bool {
								return repos[a].Pull_count > repos[b].Pull_count
							})
							break
						case "-pull_count":
							sort.Slice(repos, func(a, b int) bool {
								return repos[a].Pull_count < repos[b].Pull_count
							})
							break
					}
				}
			}
		}

		response := "{\"count\":" + strconv.Itoa(len(repos))

		if start >= len(repos) {
			repos = repos[:0]
		} else {
			if end > len(repos) {
				end = len(repos)
			}

			repos = repos[start:end]
		}

		results, err := json.Marshal(repos)
		if err == nil {
			response += ",\"results\":" + string(results)
		} else {
			response += ",\"results\":\"[]"
		}

		w.Write([]byte(response + "}\n"))
	// Query search
	} else if len(query) != 0 {
		var repos []QueryRepository
		start := page * page_size
		offset := int(start % 100)
		count := 0
		query = url.QueryEscape(query)

		// Quick check for 0 results
		if !(official == 1 && automated == 1) {
			if len(order) > 0 {
				order = "&ordering=" + order
			}

			if official != -1 {
				if official == 1 {
					order += "&is_official=1"
				} else {
					order += "&is_official=0"
				}
			}

			if automated != -1 {
				if automated == 1 {
					order += "&is_automated=1"
				} else {
					order += "&is_automated=0"
				}
			}

		query_loop:
			for i := int(start/100) + 1; len(repos) < page_size; i++ {
				bytes := cacheGetURL("https://hub.docker.com/v2/search/repositories/" + "?page_size=100&page=" + strconv.Itoa(i) + "&query=" + query + order)
				if len(bytes) > 0 {
					var data map[string]interface{}
					err := json.Unmarshal(bytes, &data)
					if err == nil {
						if data["message"] != nil || data["text"] != nil {
							break
						}

						if count == 0 {
							count = int(data["count"].(float64))
						}

						results := data["results"].([]interface{})
						for e := offset; e < len(results); e++ {
							offset = 0
							if len(repos)+1 > page_size {
								break query_loop
							}

							result := results[e].(map[string]interface{})

							name := ""
							if r := result["repo_name"]; r != nil {
								name = r.(string)
							}

							namespace := ""
							if s := strings.Index(name, "/"); s > -1 {
								namespace = name[0:s]
								name = name[s+1:]
							} else {
								namespace = "library"
							}

							description := ""
							if r := result["short_description"]; r != nil {
								description = r.(string)
							}

							is_automated := false
							if r := result["is_automated"]; r != nil {
								is_automated = r.(bool)
							}

							is_official := false
							if r := result["is_official"]; r != nil {
								is_official = r.(bool)
							}

							star_count := 0
							if r := result["star_count"]; r != nil {
								star_count = int(r.(float64))
							}

							pull_count := 0
							if r := result["pull_count"]; r != nil {
								pull_count = int(r.(float64))
							}

							repos = append(repos, QueryRepository{name, namespace, description, is_automated, is_official, star_count, pull_count})
						}
					} else {
						break
					}
				} else {
					break
				}
			}
		}

		response := "{\"count\":" + strconv.Itoa(count)

		results, err := json.Marshal(repos)
		if err == nil {
			response += ",\"results\":" + string(results)
		}

		w.Write([]byte(response + "}\n"))
	} else {
		w.WriteHeader(400)
		w.Write([]byte("{\"error\":{\"message\":\"Incorrect query parameters\"}}\n"))
	}
}

func handleArchRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	addLog(r)
		
	w.Header().Set("Content-Type", "application/json")
		
	i := r.FormValue("i")
	if len(i) > 0 {
		images := strings.Split(i, ",")
		results := make(map[string]ArchInfo)
		
		for e := 0; e < len(images); e++ {
			results[images[e]] = getArchInfo(images[e])
		}
			
		resp, err := json.Marshal(results)
		if err != nil {
			debug(0, "JSON Marshal error: %s\n", err)
			w.Write([]byte("{}"))
		} else {
			w.Write(resp)
		}
	} else {
		w.WriteHeader(400)
		w.Write([]byte("{\"error\":{\"message\":\"No images parameter found\"}}\n"))
	}
}

func handleTagsRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	addLog(r)
		
	w.Header().Set("Content-Type", "application/json")
		
	i := r.FormValue("i")
	if len(i) > 0 {
		images := strings.Split(i, ",")
		results := make(map[string][]interface{})
		
		var results_mu sync.Mutex
		var wait sync.WaitGroup
		
		for e := 0; e < len(images); e++ {
			wait.Add(1)
			
			go (func(e string) {
				results_mu.Lock()
				results[e] = getTags(e, 1)
				results_mu.Unlock()
				wait.Done()
			})(images[e])
		}
		
		wait.Wait()
			
		resp, err := json.Marshal(results)
		if err != nil {
			debug(0, "JSON Marshal error: %s\n", err)
			w.Write([]byte("{}"))
		} else {
			w.Write(resp)
		}
	} else {
		w.WriteHeader(400)
		w.Write([]byte("{\"error\":{\"message\":\"No images parameter found\"}}\n"))
	}
}