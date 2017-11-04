FROM golang as builder
COPY server/* src/
RUN go build -tags netgo -installsuffix netgo -o /server src/server.go

FROM scratch
COPY --from=builder /server /server
COPY web/* web/
ENTRYPOINT [ "/server" ]