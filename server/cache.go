package main

import (
	"crypto/sha256"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"sync"
	"time"
)

// Used to safely handle cache files
type FileMu struct {
	Count int
	Mu    *sync.RWMutex
}

var cache_path = "." + string(os.PathSeparator) + "cache" + string(os.PathSeparator)
var expire = 60
var used_files map[string]*FileMu = map[string]*FileMu{}
var used_files_mu sync.Mutex

func cacheGet(req *http.Request) []byte {
	debug(3, "Get URL: %s\n", req.URL.String())
	h := sha256.New()
	h.Write([]byte(req.URL.String()))
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
			Count: 1,
			Mu:    &sync.RWMutex{},
		}
		used_files[name] = uf
	} else {
		uf.Count++
	}

	used_files_mu.Unlock()

	uf.Mu.RLock() // Read-lock
	bytes, err := ioutil.ReadFile(cache_file)
	uf.Mu.RUnlock()

	if err != nil {
		uf.Mu.Lock()

		// Re-check file existence
		bytes, err = ioutil.ReadFile(cache_file)

		if err != nil {
			if resp, err := https.Do(req); err == nil {
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
		uf.Mu.Unlock()
	}

	used_files_mu.Lock()
	if uf, ok := used_files[name]; ok {
		uf.Count--
		if uf.Count == 0 {
			delete(used_files, name)
		}
	}
	used_files_mu.Unlock()

	return bytes
}

func cacheHas(url string) bool {
	h := sha256.New()
	h.Write([]byte(url))
	name := fmt.Sprintf("%x", h.Sum(nil))
	cache_file := cache_path + name
	_, err := os.Stat(cache_file)
	
	return err == nil
}

func cacheGetURL(url string) []byte {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		debug(0, "Unable to create HTTP Get: %s\n", err)
		return nil
	}
	
	return cacheGet(req)
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
				uf.Mu.Lock()
			}

			name := cache_path + f.Name()
			debug(3, "Removing file: %s\n", name)
			err := os.Remove(name)
			if err != nil {
				debug(0, "Unable to remove cache file \"%s\": %s\n", name, err)
			}

			if ok {
				uf.Mu.Unlock()
			}
			used_files_mu.Unlock()
		}

		time.Sleep(time.Minute)
	}
}