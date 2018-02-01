package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"strconv"
	"net/url"
)

type Manifest struct {
	Architecture string `json:"architecture"`
	Os           string `json:"os"`
	Os_version   string `json:"os_version"`
	Variant      string `json:"variant"`
}

func getManifestURL(image string, tag string) string {
	return "https://registry-1.docker.io/v2/" + image + "/manifests/" + tag
}

func getTagURL(image string, page int) string {
	return "https://hub.docker.com/v2/repositories/" + image + "/tags/?page_size=100&page=" + strconv.Itoa(page)
}

func getManifestInfo(image string, tag string) []Manifest {
	var bytes []byte

	if url := getManifestURL(image, tag); cacheHas(url) {
		bytes = cacheGetURL(url)
	} else {
		resp, err := https.Get("https://auth.docker.io/token?service=registry.docker.io&scope=repository:" + image + ":pull")
		if err != nil {
			return nil
		}
		
		bytes, err = ioutil.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil
		}
		
		var data map[string]interface{}
		if err := json.Unmarshal(bytes, &data); err != nil {
			return nil
		}
		
		token := data["token"].(string)

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil
		}
		
		req.Header.Set("Authorization", "Bearer " + token)
		req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.list.v2+json")

		bytes = cacheGet(req)
	}
	
	if len(bytes) == 0 {
		return nil
	}
	
	var data map[string]interface{}
	if err := json.Unmarshal(bytes, &data); err != nil {
		return nil
	}
	
	if data["errors"] != nil {
		return nil
	}
	
	if schema := int(data["schemaVersion"].(float64)); schema == 1 {
		var info []Manifest

		info = append(info, Manifest{ data["architecture"].(string), "", "", "" })
		
		return info
	} else if schema == 2 {
		var info []Manifest
		
		manifests := data["manifests"].([]interface{})
		for i := 0; i < len(manifests); i++ {
			platform := manifests[i].(map[string]interface{})["platform"].(map[string]interface{})
		
			if platform != nil {
				architecture := ""
				if platform["architecture"] != nil {
					architecture = platform["architecture"].(string)
				}
				
				os := ""
				if platform["os"] != nil {
					os = platform["os"].(string)
				}
				
				version := ""
				if platform["os.version"] != nil {
					version = platform["os.version"].(string)
				}
				
				variant := ""
				if platform["variant"] != nil {
					variant = platform["variant"].(string)
				}
			
				info = append(info, Manifest{ architecture, os, version, variant })
			}
		}
		
		return info
	}

	return nil
}

func getTags(image string, p ...int) []interface{} {
	page := 1
	if len(p) > 0 {
		page = p[0]
	}

	bytes := cacheGetURL(getTagURL(image, page))
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
				
				if _, e := img["variant"]; e {
					delete(img, "variant")
				}
			}
		}
		
		if cacheHas(getManifestURL(image, tag["name"].(string))) {
			tag["manifest"] = getManifestInfo(image, tag["name"].(string))
		} else {
			tag["manifest_url"] = "./manifest?i=" + url.QueryEscape(image + "/" + tag["name"].(string))
		}
	}
	
	return tags
}

func addTagAndManifestInfo(repo *Repository) {
	if img := repo.Namespace + "/" + repo.Name; cacheHas(getTagURL(img, 1)) {
		repo.Tags = getTags(img)
	} else {
		repo.Tags_url = "./tags?i=" + url.QueryEscape(img)
	}
}