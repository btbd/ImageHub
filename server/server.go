package main

import (
	"crypto/sha256"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
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

// Used to safely handle cache files
type FileMu struct {
	count int
	mu    *sync.RWMutex
}

var cache_path = "." + string(os.PathSeparator) + "cache" + string(os.PathSeparator)
var expire = 60
var log_mu sync.Mutex
var used_files map[string]*FileMu = map[string]*FileMu{}
var used_files_mu sync.Mutex
var verbose = 1
var web_path = "web"

var https = &http.Client{Transport: &http.Transport{
	TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
}}

func debug(v int, format string, args ...interface{}) {
	if v > verbose {
		return
	}
	fmt.Printf(format, args...)
}

func cacheGet(url string) []byte {
	debug(3, "Get URL: %s\n", url)

	h := sha256.New()
	h.Write([]byte(url))
	name := fmt.Sprintf("%x", h.Sum(nil))
	cache_file := cache_path + name

	debug(3, "  Cache file: %s\n", cache_file)

	defer func() {
		if r := recover(); r != nil {
			debug(0, "Runtime error: %#v\n", r)
		}
	}()

	used_files_mu.Lock()

	uf, ok := used_files[name]
	if !ok {
		uf = &FileMu{
			count: 1,
			mu:    &sync.RWMutex{},
		}
		used_files[name] = uf
	} else {
		uf.count++
	}

	used_files_mu.Unlock()

	uf.mu.RLock() // Read-lock
	bytes, err := ioutil.ReadFile(cache_file)
	uf.mu.RUnlock()

	if err != nil {
		uf.mu.Lock()

		// Re-check file existence
		bytes, err = ioutil.ReadFile(cache_file)

		if err != nil {
			if resp, err := https.Get(url); err == nil {
				if bytes, err = ioutil.ReadAll(resp.Body); err == nil {
					debug(3, "  Writing to cache file: %s\n", cache_file)
					err = ioutil.WriteFile(cache_file, bytes, 0644)
					if err != nil {
						debug(1, "  Can't write cache to cache file \"%s\": %s\n", cache_file, err)
					}
				} else {
					debug(1, "  Error in reading HTTP response: %s\n", err)
				}
				resp.Body.Close()
			} else {
				debug(1, "  Error on GET: %s\n", err)
			}
		}
		uf.mu.Unlock()
	}

	used_files_mu.Lock()
	if uf, ok := used_files[name]; ok {
		uf.count--
		if uf.count == 0 {
			delete(used_files, name)
		}
	}
	used_files_mu.Unlock()

	return bytes
}

func checkCache(minutes int) {
	for {
		files, err := ioutil.ReadDir(cache_path)
		if err != nil {
			debug(0, "Error reading cache dir \"%s\": %s\n", cache_path, err)
			os.Exit(1)
		}

		for _, f := range files {
			if len(f.Name()) != 64 {
				continue
			}

			if f.ModTime().Unix()+int64(minutes*60) >= time.Now().Unix() {
				continue
			}

			used_files_mu.Lock()
			
			uf, ok := used_files[f.Name()]
			if ok {
				uf.mu.Lock()
			}

			name := cache_path + f.Name()
			debug(3, "Removing file: %s\n", name)
			err := os.Remove(name)
			if err != nil {
				debug(0, "Unable to remove cache file \"%s\": %s\n", name, err)
			}

			if ok {
				uf.mu.Unlock()
			}
			used_files_mu.Unlock()
		}

		time.Sleep(time.Minute)
	}
}

func getNamespaceRepos(wait *sync.WaitGroup, url string, repos *[]NamespaceRepository, repos_mu *sync.Mutex, query string, automated int, is_official bool) {
	debug(3, "Namespace routine getting: %s\n", url)

	bytes := cacheGet(url)
	var add_repos []NamespaceRepository
	
	if len(bytes) > 0 {
		var data map[string]interface{}
		err := json.Unmarshal(bytes, &data)
		if err == nil && !(data["detail"] != nil && data["detail"].(string) == "Not found") {
			results := data["results"].([]interface{})
			for e := 0; e < len(results); e++ {
				result := results[e].(map[string]interface{})

				name := ""
				if r := result["name"]; r != nil {
					name = r.(string)
				}

				description := ""
				if r := result["description"]; r != nil {
					description = r.(string)
				}

				if len(query) > 0 && !(strings.Contains(strings.ToLower(name), query) || strings.Contains(strings.ToLower(description), query)) {
					continue
				}

				is_automated := false
				if r := result["is_automated"]; r != nil {
					is_automated = r.(bool)
				}

				if (automated == 0 && is_automated) || (automated == 1 && !is_automated) {
					continue
				}

				is_private := false
				if r := result["is_private"]; r != nil {
					is_private = r.(bool)
				}

				namespace := ""
				if r := result["namespace"]; r != nil {
					namespace = r.(string)
				}

				type_ := ""
				if r := result["repository_type"]; r != nil {
					type_ = r.(string)
				}

				status := 0
				if r := result["status"]; r != nil {
					status = int(r.(float64))
				}

				star_count := 0
				if r := result["star_count"]; r != nil {
					star_count = int(r.(float64))
				}

				pull_count := 0
				if r := result["pull_count"]; r != nil {
					pull_count = int(r.(float64))
				}

				last_updated := ""
				if r := result["last_updated"]; r != nil {
					last_updated = r.(string)
				}

				add_repos = append(add_repos, NamespaceRepository{name, namespace, type_, status, description, is_automated, is_private, is_official, star_count, pull_count, last_updated})
			}
		} else {
			debug(1, "  Bad request: %s\n", string(bytes))
		}
	}
	
	repos_mu.Lock()
	*repos = append(*repos, add_repos...)
	repos_mu.Unlock()
	wait.Done()
}

func addLog(r *http.Request) {
	log_mu.Lock()
	defer log_mu.Unlock()
	
	log := time.Now().Format(time.RFC3339) + " " + r.RemoteAddr + " " + r.URL.Path[1:] + "?" + r.URL.RawQuery + "\n"
	
	f, err := os.OpenFile("imagehub.log", os.O_APPEND | os.O_WRONLY, 0600)
	if err != nil {
		if err := ioutil.WriteFile("imagehub.log", []byte(log), 0644); err != nil {
			debug(0, "Unable to create log file: %s\n", err)
			os.Exit(1)
		}
	} else {
		defer f.Close()
		
		if _, err = f.WriteString(log); err != nil {
			debug(0, "  Unable to append to log file: %s\n", err)
		}
	}
}

func main() {
	usage := flag.Usage
	flag.Usage = func() {
		fmt.Println("The ImageHub server for finding container images.")
		usage()
	}

	port := 80
	if os.Getenv("PORT") != "" {
		if p, _ := strconv.Atoi(os.Getenv("PORT")); p != 0 {
			port = p
		}
	}

	flag.IntVar(&expire, "expire", expire, "time (mins) items live in the cache")
	flag.StringVar(&cache_path, "path", cache_path, "dir path for the cache")
	flag.IntVar(&port, "port", port, "port number for the server to listen on")
	flag.IntVar(&verbose, "v", verbose, "verbose/debug level")
	flag.StringVar(&web_path, "web", web_path, "web dir")
	flag.Parse()

	if len(cache_path) == 0 {
		cache_path = "."
	}
	
	if len(web_path) == 0 {
		web_path = "."
	}
	
	fi, err := os.Stat(web_path)
	if (err != nil) {
		fmt.Printf("Unable to get info for web directory: \"%s\"\n", web_path)
		os.Exit(1)
	}
	
	if !fi.Mode().IsDir() {
		fmt.Printf("Web directory is not a directory: \"%s\"\n", web_path)
		os.Exit(1)
	}

	if os.MkdirAll(cache_path, 0755) != nil {
		fmt.Printf("Unable to create directory: \"%s\"\n", cache_path)
		os.Exit(1)
	}

	if cache_path[len(cache_path)-1] != os.PathSeparator {
		cache_path += string(os.PathSeparator)
	}
	
	if web_path[len(web_path)-1] != os.PathSeparator {
		web_path += string(os.PathSeparator)
	}
	
	go checkCache(expire)

	// Handles file requests
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
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
	})

	// Handles search requests
	http.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
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
				bytes := cacheGet("https://hub.docker.com/v2/repositories/" + namespace + "?page_size=1&page=1")
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
					bytes := cacheGet("https://hub.docker.com/v2/search/repositories/" + "?page_size=100&page=" + strconv.Itoa(i) + "&query=" + query + order)

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
	})

	debug(0, "Listening on port %d\n", port)

	if err := http.ListenAndServe(":"+strconv.Itoa(port), nil); err != nil {
		fmt.Printf("Error listening on port %d: %s\n", port, err)
	}
}
