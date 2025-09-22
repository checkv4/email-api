const fastify = require("fastify")
const smtp = require("./smtp")


const server = fastify()

smtp(server)

process.addListener("unhandledRejection", (reason, p) => {
    console.log("未处理的 Promise 拒绝:", reason);
});
process.addListener("uncaughtException", (err, origin) => {
    console.log("未捕获的异常:", err);
})
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