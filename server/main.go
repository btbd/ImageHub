package main

import (
	"crypto/tls"
	"flag"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

var log_mu sync.Mutex
var verbose = 1
var web_path = "web"
var log_path = "."

var https = &http.Client{Transport: &http.Transport{
	TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
}}

func debug(v int, format string, args ...interface{}) {
	if v > verbose {
		return
	}
	
	fmt.Printf(format, args...)
}

func addLog(r *http.Request) {
	log_mu.Lock()
	defer log_mu.Unlock()
	
	log := time.Now().Format(time.RFC3339) + " " + r.RemoteAddr + " " + r.URL.Path[1:] + "?" + r.URL.RawQuery + "\n"
	
	f, err := os.OpenFile(log_path + "imagehub.log", os.O_APPEND | os.O_WRONLY, 0600)
	if err != nil {
		if err := ioutil.WriteFile(log_path + "imagehub.log", []byte(log), 0644); err != nil {
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

	flag.IntVar(&verbose, "v", verbose, "verbose/debug level")
	flag.IntVar(&expire, "expire", expire, "time (mins) items live in the cache")
	flag.IntVar(&port, "port", port, "port number for the server to listen on")
	flag.StringVar(&cache_path, "cache-path", cache_path, "dir path for the cache")
	flag.StringVar(&log_path, "log-path", log_path, "path for the log file")
	flag.StringVar(&web_path, "web-path", web_path, "path for the client-side web dir")
	flag.Parse()

	if len(cache_path) == 0 {
		cache_path = "."
	}
	
	if len(web_path) == 0 {
		web_path = "."
	}
	
	if len(log_path) == 0 {
		log_path = "."
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
	
	if log_path[len(log_path)-1] != os.PathSeparator {
		log_path += string(os.PathSeparator)
	}
	
	go checkCache(expire)

	// Handles file requests
	http.HandleFunc("/", handleFileRequest)

	// Handles search requests
	http.HandleFunc("/search", handleSearchRequest)
	
	// Handles architecture requests
	http.HandleFunc("/manifest", handleManifestRequest)
	
	// Handles tag requests
	http.HandleFunc("/tags", handleTagsRequest)

	debug(0, "Listening on port %d\n", port)

	if err := http.ListenAndServe(":"+strconv.Itoa(port), nil); err != nil {
		fmt.Printf("Error listening on port %d: %s\n", port, err)
	}
}