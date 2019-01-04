FROM golang:1.9 as builder
COPY main.go src/
COPY dockerhub/* src/dockerhub/
RUN GO_EXTLINK_ENABLED=0 CGO_ENABLED=0 go build \
	-ldflags "-w -extldflags -static" \
	-tags netgo -installsuffix netgo \
	-o /server ./src

FROM alpine
RUN apk update && apk add ca-certificates && rm -rf /var/cache/apk/*
COPY --from=builder /server /server
COPY web/* web/
ENTRYPOINT [ "/server" ]
