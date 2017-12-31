all: binary

binary: bin/server

bin/server: server/*.go
	mkdir -p bin
	go build -tags netgo -installsuffix netgo -o $@ ./server

start: binary
	bin/server
    
clean:
	rm -rf bin
 