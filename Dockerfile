FROM golang:1.9 as builder
COPY server/* src/
RUN GO_EXTLINK_ENABLED=0 CGO_ENABLED=0 go build \
	-ldflags "-w -extldflags -static" \
	-tags netgo -installsuffix netgo \
	-o /server ./src

FROM scratch
COPY --from=builder /server /server
COPY web/* web/
ENTRYPOINT [ "/server" ]
