package dockerhub

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"math"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"
)

type User struct {
	Username string
	Token    string
}

type Repository struct {
	Affiliation      string `json:"affiliation,omitempty"`
	Editable         bool   `json:"can_edit,omitempty"`
	ShortDescription string `json:"description,omitempty"`
	Description      string `json:"full_description",omitempty`
	Starred          bool   `json:"has_starred,omitempty"`
	Automated        bool   `json:"is_automated,omitempty"`
	Private          bool   `json:"is_private"`
	LastUpdated      string `json:"last_updated,omitempty"`
	Name             string `json:"name,omitempty"`
	Namespace        string `json:"namespace,omitempty"`
	Permissions      struct {
		Read  bool `json:"read,omitempty"`
		Write bool `json:"write,omitempty"`
		Admin bool `json:"admin,omitempty"`
	} `json:"permissions",omitempty`
	Pulls          int64  `json:"pull_count,omitempty"`
	RepositoryType string `json:"repository_type,omitempty"`
	Stars          int64  `json:"star_count,omitempty"`
	Status         int64  `json:"status,omitempty"`
	User           string `json:"user,omitempty"`
}

type RepositorySummary struct {
	Architectures []struct {
		Label string `json:"label"`
		Name  string `json:"name"`
	} `json:"architectures"`
	Categories []struct {
		Label string `json:"label"`
		Name  string `json:"name"`
	} `json:"categories"`
	CertificationStatus string `json:"certification_status"`
	CreatedAt           string `json:"created_at"`
	FilterType          string `json:"filter_type"`
	Id                  string `json:"id"`
	LogoUrl             struct {
		Large string `json:"large"`
		Small string `json:"small"`
	} `json:"logo_url"`
	Name             string `json:"name"`
	OperatingSystems []struct {
		Label string `json:"label"`
		Name  string `json:"name"`
	} `json:"operating_systems"`
	Popularity int `json:"popularity"`
	Publisher  struct {
		Id   string `json:"id"`
		Name string `json:"name"`
	} `json:"publisher"`
	Pulls            string `json:"pull_count"`
	ShortDescription string `json:"short_description"`
	Slug             string `json:"slug"`
	Source           string `json:"source"`
	Stars            int    `json:"star_count"`
	Type             string `json:"type"`
	UpdatedAt        string `json:"updated_at"`
}

type Organization struct {
	Namespace string `json:"orgname,omitempty"`
	Name      string `json:"full_name"`
	Company   string `json:"company"`
	Location  string `json:"location"`
	Email     string `json:"gravatar_email"`
	Website   string `json:"profile_url"`
}

type Tag struct {
	Creator  int `json:"creator,omitempty"`
	FullSize int `json:"full_size,omitempty"`
	Id       int `json:"id,omitempty"`
	Image_id int `json:"image_id,omitempty"`
	Images   []struct {
		Architecture string `json:"architecture,omitempty"`
		Os           string `json:"os,omitempty"`
		OsVersion    string `json:"os_version,omitempty"`
		Size         int    `json:"size,omitempty"`
		Variant      string `json:"variant,omitempty"`
	} `json:"images,omitempty"`
	LastUpdated string `json:"last_updated,omitempty"`
	LastUpdater int    `json:"last_updater,omitempty"`
	Name        string `json:"name,omitempty"`
	Repository  int    `json:"repository,omitempty"`
	V2          bool   `json:"v2,omitempty"`
}

type Manifest struct {
	SchemaVersion int    `json:"schemaVersion,omitempty"`
	Name          string `json:"name,omitempty"`
	Tag           string `json:"tag,omitempty"`
	Architecture  string `json:"architecture,omitempty"`
	FsLayers      []struct {
		BlobSum string `json:"blobSum,omitempty"`
	} `json:"fsLayers,omitempty"`
	History []struct {
		V1Compatibility string `json:"v1Compatibility,omitempty"`
	} `json:"history,omitempty"`
	Signatures []struct {
		Header struct {
			JWK struct {
				CRV string `json:"crv,omitempty"`
				KID string `json:"kid,omitempty"`
				KTY string `json:"kty,omitempty"`
				X   string `json:"x,omitempty"`
				Y   string `json:"y,omitempty"`
			} `json:"jwk,omitempty"`
			Alg string `json:"alg,omitempty"`
		} `json:"header,omitempty"`
		Signature string `json:"signature,omitempty"`
		Protected string `json:"protected,omitempty"`
	} `json:"signatures,omitempty"`
	MediaType string `json:"mediaType,omitempty"`
	Manifests []struct {
		MediaType string `json:"mediaType,omitempty"`
		Size      int    `json:"size,omitempty"`
		Digest    string `json:"digest,omitempty"`
		Platform  struct {
			Architecture string `json:"architecture,omitempty"`
			Os           string `json:"os,omitempty"`
			OsVersion    string `json:"os.version,omitempty"`
			Variant      string `json:"variant,omitempty"`
		} `json:"platform,omitempty"`
	} `json:"manifests,omitempty"`
}

var cache_path string
var cache_timeout int
var cache_files map[string]*sync.Mutex = make(map[string]*sync.Mutex)
var cache_files_mu *sync.RWMutex = &sync.RWMutex{}
var cache_clear_mu *sync.RWMutex = &sync.RWMutex{}

func StartCache() {
	go func() {
		for {
			files, err := ioutil.ReadDir(cache_path)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error reading cache dir \"%s\": %s\n", cache_path, err)
				os.Exit(1)
			}

			for _, f := range files {
				if len(f.Name()) != 64 {
					continue
				}

				if f.ModTime().Unix()+int64(cache_timeout*60) > time.Now().Unix() {
					continue
				}

				name := cache_path + f.Name()
				cache_clear_mu.Lock()
				err := os.Remove(name)
				cache_clear_mu.Unlock()

				if err != nil {
					fmt.Fprintf(os.Stderr, "Unable to remove cache file \"%s\": %s\n", name, err)
				}
			}

			time.Sleep(time.Minute)
		}
	}()
}

func SetCachePath(s string) {
	if err := os.MkdirAll(s, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create cache directory: \"%s\"\n", cache_path, err)
		os.Exit(1)
	}

	cache_path = s
}

func SetCacheTimeout(t int) {
	cache_timeout = t
}

func GetHashedName(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	return fmt.Sprintf("%x", h.Sum(nil))
}

func CacheGet(name string) (bool, []byte) {
	body, err := ioutil.ReadFile(cache_path + name)
	if err != nil {
		return false, nil
	} else {
		return true, body
	}
}

func CacheAdd(url string, body []byte) {
	path := cache_path + GetHashedName(url)
	err := ioutil.WriteFile(path, body, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write to cache file \"%s\": %v\n", path, err)
	}
}

func GetPagedResults(u *User, url string, prop string, start int, max int, rtype reflect.Type) (interface{}, int, error) {
	results := reflect.MakeSlice(rtype, 0, 0)
	var wg = &sync.WaitGroup{}
	var mu = &sync.Mutex{}
	var count = 0

	if strings.Contains(url, "?") {
		url += "&page_size="
	} else {
		url += "?page_size="
	}

	_, resp, err := Request(u, "GET", url+"1", nil)
	if err != nil {
		return results.Interface(), 0, err
	}

	var data map[string]interface{}
	if err := json.Unmarshal(resp, &data); err != nil {
		return results.Interface(), 0, err
	}

	if v, ok := data["count"].(float64); ok {
		count = int(v)
	}

	if count == 0 {
		return results.Interface(), count, nil
	}

	var gerr error
	for i := start; i < int(math.Ceil(float64(count)/100)) && i < max && gerr == nil; i++ {
		wg.Add(1)
		go func(page int) {
			defer wg.Done()

			_, resp, err := Request(u, "GET", url+"100&page="+strconv.Itoa(page), nil)
			if err != nil {
				gerr = err
				return
			}

			if gerr == nil {
				data := reflect.New(reflect.StructOf([]reflect.StructField{{
					Name: "Results",
					Type: rtype,
					Tag:  reflect.StructTag(`json:"` + prop + `"`),
				}})).Interface()

				if err := json.Unmarshal(resp, data); err != nil {
					gerr = err
					return
				}

				r := reflect.ValueOf(data).Elem().Field(0)
				mu.Lock()
				for i := 0; i < r.Len(); i++ {
					results = reflect.Append(results, r.Index(i))
				}
				mu.Unlock()
			}
		}(i + 1)
	}

	wg.Wait()
	return results.Interface(), count, gerr
}

func ReturnDetails(body []byte) error {
	var r map[string]interface{}
	json.Unmarshal(body, &r)
	if r["detail"] != nil {
		return errors.New(r["detail"].(string))
	}

	return errors.New(string(body))
}

func Request(u *User, method string, url string, body io.Reader) (int, []byte, error) {
	cache := strings.ToUpper(method) == "GET"
	if cache {
		name := GetHashedName(url)

		cache_clear_mu.RLock()
		defer cache_clear_mu.RUnlock()

		cache_files_mu.RLock()
		mu, ok := cache_files[name]
		cache_files_mu.RUnlock()
		if !ok {
			mu = &sync.Mutex{}
			cache_files_mu.Lock()
			cache_files[name] = mu
			cache_files_mu.Unlock()
		}

		mu.Lock()
		defer mu.Unlock()

		got, body := CacheGet(name)
		if got {
			return 200, body, nil
		}
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return 0, nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "JWT "+u.Token)
	req.Header.Set("Search-Version", "v3")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}

	defer resp.Body.Close()

	b, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return 0, nil, err
	}

	if cache && resp.StatusCode == 200 {
		CacheAdd(url, b)
	}

	return resp.StatusCode, b, nil
}

func StandardRequest(u *User, method string, url string, buffer io.Reader, success int) error {
	status, body, err := Request(u, method, url, buffer)
	if err != nil {
		return err
	}

	if status != success {
		return ReturnDetails(body)
	}

	return nil
}

func (u *User) Login(username string, password string) error {
	var login = []byte(`{"username":"` + username + `","password":"` + password + `"}`)
	_, body, err := Request(u, "POST", "https://hub.docker.com/v2/users/login/", bytes.NewBuffer(login))
	if err != nil {
		return err
	}

	var token map[string]interface{}
	json.Unmarshal(body, &token)
	if token["token"] != nil {
		u.Token = token["token"].(string)
	} else {
		return ReturnDetails(body)
	}

	u.Username = username

	return nil
}

// Note: some results might be missing because dockerhub search is inconsistent
func (u *User) Search(query string, page int) ([]RepositorySummary, int, error) {
	page *= 20

	var summaries []RepositorySummary
	o, count, err := GetPagedResults(u, "https://store.docker.com/api/content/v1/products/search/?"+query, "summaries", page, page+20, reflect.TypeOf(summaries))
	if err != nil {
		return summaries, count, err
	}

	all := len(o.([]RepositorySummary)) == count

	// Remove possible duplicates
	done := make(map[string]int)
	for _, s := range o.([]RepositorySummary) {
		name := s.Publisher.Name + "/" + s.Name
		if _, ok := done[name]; !ok {
			summaries = append(summaries, s)
			done[name] = 1
		}
	}

	if all {
		count = len(summaries)
	}

	return summaries, count, err
}

func (u *User) GetManifest(image string, tag string) (Manifest, error) {
	var man Manifest

	resp, err := http.Get("https://auth.docker.io/token?service=registry.docker.io&scope=repository:" + image + ":pull")
	if err != nil {
		return man, err
	}

	body, err := ioutil.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return man, err
	}

	var data map[string]interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		return man, err
	}

	if data["token"] == nil {
		return man, errors.New(string(body))
	}

	token := data["token"].(string)

	req, err := http.NewRequest("GET", "https://registry-1.docker.io/v2/"+image+"/manifests/"+tag, nil)
	if err != nil {
		return man, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.list.v2+json")

	client := http.Client{}
	resp, err = client.Do(req)
	if err != nil {
		return man, err
	}

	body, err = ioutil.ReadAll(resp.Body)
	resp.Body.Close()

	if err := json.Unmarshal(body, &man); err != nil {
		return man, err
	}

	return man, nil
}

func (u *User) GetRepository(image string) (Repository, error) {
	status, body, err := Request(u, "GET", "https://hub.docker.com/v2/repositories/"+image+"/", nil)
	if err != nil {
		return Repository{}, err
	}

	if status != 200 {
		return Repository{}, ReturnDetails(body)
	}

	var repo Repository
	json.Unmarshal(body, &repo)
	return repo, nil
}

func (u *User) GetTags(repo string) ([]Tag, error) {
	var rtype []Tag
	o, _, err := GetPagedResults(u, "https://hub.docker.com/v2/repositories/"+repo+"/tags/", "results", 0, 0x7FFFFFFF, reflect.TypeOf(rtype))
	return o.([]Tag), err
}

func (u *User) GetNamespaceRepositories(namespace string) ([]Repository, error) {
	var rtype []Repository
	o, _, err := GetPagedResults(u, "https://hub.docker.com/v2/repositories/"+namespace, "results", 0, 0x7FFFFFFF, reflect.TypeOf(rtype))
	return o.([]Repository), err
}

func (u *User) CreateRepository(repository Repository) error {
	j, err := json.Marshal(repository)
	if err != nil {
		return err
	}

	status, body, err := Request(u, "POST", "https://hub.docker.com/v2/repositories/", bytes.NewBuffer(j))
	if err != nil {
		return err
	}

	if status != 201 {
		var r map[string]interface{}
		json.Unmarshal(body, &r)
		if r["__all__"] != nil {
			return errors.New(r["__all__"].([]interface{})[0].(string))
		}

		return ReturnDetails(body)
	}

	return nil
}

func (u *User) EditRepository(repository Repository) error {
	j, err := json.Marshal(repository)
	if err != nil {
		return err
	}

	status, body, err := Request(u, "PATCH", "https://hub.docker.com/v2/repositories/"+repository.Namespace+"/"+repository.Name+"/", bytes.NewBuffer(j))
	if err != nil {
		return err
	}

	if status != 200 {
		return ReturnDetails(body)
	}

	return nil
}

func (u *User) DeleteRepository(name string) error {
	return StandardRequest(u, "DELETE", "https://hub.docker.com/v2/repositories/"+name+"/", nil, 202)
}

func (u *User) SetRepositoryPrivacy(name string, private bool) error {
	return StandardRequest(u, "POST", "https://hub.docker.com/v2/repositories/"+name+"/privacy/", bytes.NewBuffer([]byte(`{"is_private":`+strconv.FormatBool(private)+`}`)), 200)
}

func (u *User) AddCollaborator(name string, collaborator string) error {
	return StandardRequest(u, "POST", "https://hub.docker.com/v2/repositories/"+name+"/collaborators/", bytes.NewBuffer([]byte(`{"user":"`+collaborator+`"}`)), 201)
}

func (u *User) RemoveCollaborator(name string, collaborator string) error {
	return StandardRequest(u, "DELETE", "https://hub.docker.com/v2/repositories/"+name+"/collaborators/"+collaborator+"/", nil, 204)
}

func (u *User) GetCollaborators(name string) ([]string, error) {
	var rtype []map[string]interface{}
	var c []string

	o, _, err := GetPagedResults(u, "https://hub.docker.com/v2/repositories/"+name+"/collaborators/", "results", 0, 0x7FFFFFFF, reflect.TypeOf(rtype))
	results := o.([]map[string]interface{})

	if err != nil {
		return c, err
	}

	for _, e := range results {
		c = append(c, e["user"].(string))
	}

	return c, err
}

func (u *User) GetTeamID(organization string, team string) (int, error) {
	_, body, err := Request(u, "GET", "https://hub.docker.com/v2/orgs/"+organization+"/groups/"+team+"/", nil)
	if err != nil {
		return 0, err
	}

	var info map[string]interface{}
	json.Unmarshal(body, &info)

	if info["id"] != nil {
		return int(info["id"].(float64)), nil
	} else if info["detail"] == nil {
		return 0, errors.New("Team '" + organization + "/" + team + "' doesn't exist")
	}

	return 0, ReturnDetails(body)
}

func (u *User) GetTeam(organization string, team string) (map[string]interface{}, error) {
	var info map[string]interface{}

	_, body, err := Request(u, "GET", "https://hub.docker.com/v2/orgs/"+organization+"/groups/"+team+"/", nil)
	if err != nil {
		return info, err
	}

	json.Unmarshal(body, &info)

	if info["id"] != nil {
		return info, nil
	}

	return info, ReturnDetails(body)
}

func (u *User) AddTeam(name string, team string, permission string) error {
	id, err := u.GetTeamID(strings.Split(name, "/")[0], team)
	if err != nil {
		return err
	}

	return StandardRequest(u, "POST", "https://hub.docker.com/v2/repositories/"+name+"/groups/", bytes.NewBuffer([]byte(`{"group_id":`+strconv.Itoa(id)+`,"permission":"`+permission+`"}`)), 200)
}

func (u *User) RemoveTeam(name string, team string) error {
	id, err := u.GetTeamID(strings.Split(name, "/")[0], team)
	if err != nil {
		return err
	}

	return StandardRequest(u, "DELETE", "https://hub.docker.com/v2/repositories/"+name+"/groups/"+strconv.Itoa(id)+"/", nil, 204)
}

func (u *User) GetTeams(name string) ([]map[string]interface{}, error) {
	var rtype []map[string]interface{}
	o, _, err := GetPagedResults(u, "https://hub.docker.com/v2/repositories/"+name+"/groups/", "results", 0, 0x7FFFFFFF, reflect.TypeOf(rtype))
	return o.([]map[string]interface{}), err
}

func (u *User) CreateOrganization(org Organization) error {
	j, err := json.Marshal(org)
	if err != nil {
		return err
	}

	return StandardRequest(u, "POST", "https://hub.docker.com/v2/orgs/", bytes.NewBuffer(j), 201)
}

func (u *User) EditOrganization(name string, org Organization) error {
	j, err := json.Marshal(org)
	if err != nil {
		return err
	}

	return StandardRequest(u, "PATCH", "https://hub.docker.com/v2/orgs/"+name+"/", bytes.NewBuffer(j), 200)
}

func (u *User) GetOrganizationTeams(org string) ([]map[string]interface{}, error) {
	var rtype []map[string]interface{}
	o, _, err := GetPagedResults(u, "https://hub.docker.com/v2/orgs/"+org+"/groups/", "results", 0, 0x7FFFFFFF, reflect.TypeOf(rtype))
	return o.([]map[string]interface{}), err
}

func (u *User) CreateTeam(org string, team string, description string) error {
	return StandardRequest(u, "POST", "https://hub.docker.com/v2/orgs/"+org+"/groups/", bytes.NewBuffer([]byte(`{"orgname":"`+org+`","name":"`+team+`","description":"`+description+`"}`)), 201)
}

func (u *User) EditTeam(org string, team string, name string, description string) error {
	if name == "" && description == "" {
		return nil
	}

	if description != "" && name == "" {
		name = team
	} else if description == "" && name != "" {
		data, err := u.GetTeam(org, team)
		if err != nil {
			return err
		}

		description = data["description"].(string)
	}

	var j = []byte(`{"name":"` + name + `","description":"` + description + `"}`)
	return StandardRequest(u, "PATCH", "https://hub.docker.com/v2/orgs/"+org+"/groups/"+team+"/", bytes.NewBuffer(j), 200)
}

func (u *User) DeleteTeam(org string, team string) error {
	return StandardRequest(u, "DELETE", "https://hub.docker.com/v2/orgs/"+org+"/groups/"+team+"/", nil, 204)
}

func (u *User) GetTeamMembers(org string, team string) ([]map[string]interface{}, error) {
	var r []map[string]interface{}

	status, body, err := Request(u, "GET", "https://hub.docker.com/v2/orgs/"+org+"/groups/"+team+"/members/", nil)
	if err != nil {
		return r, err
	}

	if status != 200 {
		return r, ReturnDetails(body)
	}

	json.Unmarshal(body, &r)

	return r, nil
}

func (u *User) AddTeamMember(org string, team string, member string) error {
	return StandardRequest(u, "POST", "https://hub.docker.com/v2/orgs/"+org+"/groups/"+team+"/members/", bytes.NewBuffer([]byte(`{"member":"`+member+`"}`)), 200)
}

func (u *User) RemoveTeamMember(org string, team string, member string) error {
	return StandardRequest(u, "DELETE", "https://hub.docker.com/v2/orgs/"+org+"/groups/"+team+"/members/"+member+"/", nil, 204)
}
