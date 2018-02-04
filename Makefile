all: binary image

binary: bin/server

bin/server: server/*.go
	mkdir -p bin
	go build -o $@ ./server

start: binary
	bin/server
    
image: bin/server
	docker build -t $(REGISTRY)imagehub .

push: image
	docker push $(REGISTRY)imagehub

clean:
	rm -rf bin
 
