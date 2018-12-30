package main

import (
	"./dockerhub"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
)

var user dockerhub.User
var web_path string

func HandleFileRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	url := r.URL.Path[1:]
	if url == "" {
		url = "index.html"
	}

	url = web_path + url

	bytes, err := ioutil.ReadFile(url)
	if err == nil {
		w.Write(bytes)
	} else {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("404: \"" + url + "\" not found\n"))
	}
}

func HandleSearchRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	w.Header().Set("Content-Type", "application/json")

	query := strings.ToLower(r.FormValue("q"))
	namespace := strings.ToLower(r.FormValue("n"))
	page, _ := strconv.Atoi(r.FormValue("p"))
	arch := strings.ToLower(r.FormValue("arch"))
	archs := strings.Split(arch, ",")
	os := strings.ToLower(r.FormValue("os"))
	oss := strings.Split(os, ",")

	if namespace == "" {
		results, count, err := user.Search("type=image&q="+url.QueryEscape(query)+"&architecture="+arch+"&operating_system="+os, page)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(err.Error()))
			return
		}

		var resp struct {
			Count   int                           `json:"count"`
			Pages   int                           `json:"pages"`
			Results []dockerhub.RepositorySummary `json:"results"`
		}

		resp.Count = count
		resp.Pages = int(math.Ceil(float64(count) / 2000))
		resp.Results = results

		body, err := json.Marshal(resp)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(err.Error()))
		} else {
			w.Write(body)
		}
	} else {
		repos, err := user.GetNamespaceRepositories(namespace)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(err.Error()))
			return
		}

		var resp struct {
			Count   int                           `json:"count"`
			Pages   int                           `json:"pages"`
			Results []dockerhub.RepositorySummary `json:"results"`
		}

		resp.Pages = 1

		var wg = &sync.WaitGroup{}
		var mu = &sync.Mutex{}

		var cache_mu = &sync.Mutex{}
		cache := make(map[string]dockerhub.RepositorySummary)

		if namespace != "library" {
			possible, _, err := user.Search("type=image&q="+url.QueryEscape(namespace), 0)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(err.Error()))
				return
			}

			for _, s := range possible {
				name := s.Name
				if s.Publisher.Id == "docker" {
					name = "library/" + name
				}

				cache[name] = s
			}
		}

		for i := 0; i < len(repos); i += 25 {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()

				for end := i + 25; i < end && i < len(repos); i++ {
					if query == "" || strings.Contains(repos[i].Name, query) || strings.Contains(repos[i].ShortDescription, query) {
						name := namespace + "/" + repos[i].Name
						summary, _ := GetRepositorySummary(&user, name, &cache, cache_mu)

						if summary.Name == "" {
							summary.Publisher.Name = namespace
							summary.Name = repos[i].Name
							summary.ShortDescription = repos[i].ShortDescription
							if v := float64(repos[i].Pulls); v/1000 < 1 {
								summary.Pulls = strconv.Itoa(int(v))
							} else if k := v / (1000 * 1000); k < 1 {
								summary.Pulls = fmt.Sprintf("%.1fK+", v/1000)
							} else if k >= 10 {
								summary.Pulls = "10M+"
							} else {
								summary.Pulls = fmt.Sprintf("%.1fM+", v/(1000*1000))
							}
							summary.Stars = int(repos[i].Stars)

							tags, _ := user.GetTags(name)
							archs := make(map[string]int)
							oss := make(map[string]int)
							for _, tag := range tags {
								for _, img := range tag.Images {
									if img.Architecture != "" {
										if _, ok := archs[img.Architecture]; !ok {
											var arch struct {
												Label string `json:"label"`
												Name  string `json:"name"`
											}

											arch.Name = img.Architecture
											summary.Architectures = append(summary.Architectures, arch)
											archs[img.Architecture] = 1
										}
									}

									if img.Os != "" {
										name := img.Os + img.Variant
										if _, ok := oss[name]; !ok {
											var os struct {
												Label string `json:"label"`
												Name  string `json:"name"`
											}

											os.Name = name
											summary.OperatingSystems = append(summary.OperatingSystems, os)
											archs[name] = 1
										}
									}
								}
							}
						}

						if query == "" || strings.Contains(summary.Name, query) || strings.Contains(summary.ShortDescription, query) {
							add := true
							if arch != "" {
								add = false
							arch_loop:
								for _, a := range summary.Architectures {
									for _, b := range archs {
										if a.Name == b {
											add = true
											break arch_loop
										}
									}
								}
							}

							if add && os != "" {
								add = false
							os_loop:
								for _, a := range summary.OperatingSystems {
									for _, b := range oss {
										if a.Name == b {
											add = true
											break os_loop
										}
									}
								}
							}

							if add {
								mu.Lock()
								resp.Results = append(resp.Results, summary)
								mu.Unlock()
							}
						}
					}
				}

			}(i)
		}

		wg.Wait()

		resp.Count = len(resp.Results)

		body, err := json.Marshal(resp)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(err.Error()))
		} else {
			w.Write(body)
		}
	}
}

func HandleTagRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	w.Header().Set("Content-Type", "application/json")

	image := strings.ToLower(r.FormValue("i"))

	tags, err := user.GetTags(image)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}

	body, err := json.Marshal(tags)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
	} else {
		w.Write(body)
	}
}

func HandleManifestRequest(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	w.Header().Set("Content-Type", "application/json")

	image := strings.ToLower(r.FormValue("i"))
	tag := strings.ToLower(r.FormValue("t"))

	manifest, err := user.GetManifest(image, tag)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}

	body, err := json.Marshal(manifest)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
	} else {
		w.Write(body)
	}
}

func GetRepositorySummary(u *dockerhub.User, image string, cache *map[string]dockerhub.RepositorySummary, mu *sync.Mutex) (dockerhub.RepositorySummary, error) {
	mu.Lock()
	if s, ok := (*cache)[image]; ok {
		mu.Unlock()
		return s, nil
	}
	mu.Unlock()

	var summary dockerhub.RepositorySummary
	_, body, err := dockerhub.Request(u, "GET", "https://store.docker.com/api/content/v1/products/search/?type=image&page_size=2&page=1&q="+url.QueryEscape(image), nil)
	if err != nil {
		return summary, err
	}

	var results struct {
		Summaries []dockerhub.RepositorySummary `json:"summaries"`
	}

	if err := json.Unmarshal(body, &results); err != nil {
		return summary, err
	}

	for _, s := range results.Summaries {
		name := s.Name
		if s.Publisher.Id == "docker" {
			name = "library/" + name
		}

		if name == image {
			summary = s
		}

		mu.Lock()
		(*cache)[name] = s
		mu.Unlock()
	}

	return summary, nil
}

func main() {
	port := 80
	timeout := 20
	web_path = "web"
	cache_path := "cache"

	flag.IntVar(&timeout, "t", timeout, "time in minutes for cache items to live")
	flag.IntVar(&port, "p", port, "port")
	flag.StringVar(&cache_path, "cache", cache_path, "dir path for cache")
	flag.StringVar(&web_path, "web", web_path, "dir path for web files")
	flag.Parse()

	if web_path[len(web_path)-1] != os.PathSeparator {
		web_path += string(os.PathSeparator)
	}

	if cache_path[len(cache_path)-1] != os.PathSeparator {
		cache_path += string(os.PathSeparator)
	}

	dockerhub.SetCachePath(cache_path)
	dockerhub.SetCacheTimeout(timeout)
	dockerhub.StartCache()

	http.HandleFunc("/", HandleFileRequest)
	http.HandleFunc("/search", HandleSearchRequest)
	http.HandleFunc("/tags", HandleTagRequest)
	http.HandleFunc("/manifest", HandleManifestRequest)

	fmt.Printf("Listening on port %d\n", port)

	if err := http.ListenAndServe(":"+strconv.Itoa(port), nil); err != nil {
		fmt.Fprintf(os.Stderr, "Error listening on port %d: %s\n", port, err)
	}
}
