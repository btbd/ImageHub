package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"strings"
	"sync"
	"fmt"
	"strconv"
)

type ArchInfo struct {
	Arch []string `json:"arch"`
	Os   []string `json:"os"`
}

func getManifestURL(image string) string {
	return "https://registry-1.docker.io/v2/" + image + "/manifests/latest"
}

func formatRequest(r *http.Request) string {
 // Create return string
 var request []string
 // Add the request string
 url := fmt.Sprintf("%v %v %v", r.Method, r.URL, r.Proto)
 request = append(request, url)
 // Add the host
 request = append(request, fmt.Sprintf("Host: %v", r.Host))
 // Loop through headers
 for name, headers := range r.Header {
   name = strings.ToLower(name)
   for _, h := range headers {
     request = append(request, fmt.Sprintf("%v: %v", name, h))
   }
 }
 
 // If this is a POST, add post data
 if r.Method == "POST" {
    r.ParseForm()
    request = append(request, "\n")
    request = append(request, r.Form.Encode())
 } 
  // Return the request as a string
  return strings.Join(request, "\n")
}

func getArchInfo(image string) ArchInfo {
	var bytes []byte
	
	if url := getManifestURL(image); cacheHas(url) {
		bytes = cacheGetURL(url)
	} else {
		resp, err := https.Get("https://auth.docker.io/token?service=registry.docker.io&scope=repository:" + image + ":pull")
		if err != nil {
			return ArchInfo{}
		}
		
		bytes, err = ioutil.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return ArchInfo{}
		}
		
		var data map[string]interface{}
		if err := json.Unmarshal(bytes, &data); err != nil {
			return ArchInfo{}
		}
		
		token := data["token"].(string)

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return ArchInfo{}
		}
		
		req.Header.Set("Authorization", "Bearer " + token)
		req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.list.v2+json")

		bytes = cacheGet(req)
	}
	
	if len(bytes) == 0 {
		return ArchInfo{}
	}

	var data map[string]interface{}
	if err := json.Unmarshal(bytes, &data); err != nil {
		return ArchInfo{}
	}
	
	if data["errors"] != nil {
		return ArchInfo{}
	}
	
	if schema := int(data["schemaVersion"].(float64)); schema == 1 {
		var info ArchInfo
		
		info.Arch = []string{ data["architecture"].(string) }
		info.Os = []string{ }
		
		return info
	} else if schema == 2 {
		manifests := data["manifests"].([]interface{})
		
		var info ArchInfo
		
		var arch []string
		var os []string
		
		for i := 0; i < len(manifests); i++ {
			a := manifests[i].(map[string]interface{})["platform"].(map[string]interface{})["architecture"].(string)
			o := manifests[i].(map[string]interface{})["platform"].(map[string]interface{})["os"].(string)
			
			add := true
			for e := 0; e < len(arch); e++ {
				if arch[e] == a {
					add = false
					break
				}
			}
			
			if add {
				arch = append(arch, a)
			}
			
			add = true
			for e := 0; e < len(os); e++ {
				if os[e] == o {
					add = false
					break
				}
			}
			
			if add {
				os = append(os, o)
			}
		}
		
		info.Arch = arch
		info.Os = os
		return info
	}
	
	return ArchInfo{}
}

func getNamespaceRepos(wait *sync.WaitGroup, url string, repos *[]NamespaceRepository, repos_mu *sync.Mutex, query string, automated int, is_official bool) {
	debug(3, "Namespace routine getting: %s\n", url)

	bytes := cacheGetURL(url)
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

func getTags(image string, page int) []interface{} {
	bytes := cacheGetURL("https://hub.docker.com/v2/repositories/" + image + "/tags/?page_size=100&page=" + strconv.Itoa(page))
	if len(bytes) == 0 {
		return nil
	}

	var data map[string]interface{}
	if err := json.Unmarshal(bytes, &data); err != nil {
		return nil
	}
	
	if data["results"] == nil {
		return nil
	}
	
	var tags []interface{} = data["results"].([]interface{})
	
	if data["next"] != nil {
		var add []interface{} = getTags(image, page + 1)
		if add != nil {
			tags = append(tags, add...)
		}
	}
	
	for _, i := range tags {
		tag := i.(map[string]interface{})
		
		if _, e := tag["creator"]; e {
			delete(tag, "creator")
		}
		
		if _, e := tag["id"]; e {
			delete(tag, "id")
		}
		
		if _, e := tag["image_id"]; e {
			delete(tag, "image_id")
		}
		
		if _, e := tag["last_updater"]; e {
			delete(tag, "last_updater")
		}
		
		if _, e := tag["repository"]; e {
			delete(tag, "repository")
		}
		
		if _, e := tag["v2"]; e {
			delete(tag, "v2")
		}
		
		if tag["images"] != nil {
			images := tag["images"].([]interface{})
			for _, i := range images {
				img := i.(map[string]interface{})
				
				if _, e := img["features"]; e {
					delete(img, "features")
				}
				
				if _, e := img["os_features"]; e {
					delete(img, "os_features")
				}
				
				if _, e := img["os_version"]; e {
					delete(img, "os_version")
				}
				
				if _, e := img["variant"]; e {
					delete(img, "variant")
				}
			}
		}
	}
	
	return tags
}