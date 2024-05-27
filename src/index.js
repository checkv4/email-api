const fastify = require("fastify")
const smtp = require("./smtp")


const server = fastify()

smtp(server)

server.listen({
    port: 2501,
    host: "0.0.0.0"
}, (err, adr) => {
    if (err) {
        server.log.error(err)
        return process.exit(1)
    }
    console.log("App Address:", adr)
})