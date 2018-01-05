all: binary image

binary: bin/server

bin/server: server/*.go
	mkdir -p bin
	GO_EXTLINK_ENABLED=0 CGO_ENABLED=0 go build \
		-ldflags "-w -extldflags -static" \
		-tags netgo -installsuffix netgo \
		-o $@ ./server

start: binary
	bin/server
    
image: bin/server
	docker build -t $(REGISTRY)imagehub .

push: image
	docker push $(REGISTRY)imagehub

clean:
	rm -rf bin
 
