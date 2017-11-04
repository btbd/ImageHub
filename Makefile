all: binary

binary: bin/server

bin/server: server/server.go
	mkdir -p bin
	go build -tags netgo -installsuffix netgo -o $@ $<

start:
	bin/server
    
clean:
	rm -rf bin