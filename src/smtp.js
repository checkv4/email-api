const SMTPServer = require("smtp-server").SMTPServer;
const parser = require("mailparser").simpleParser

const emails = [];
const smtp_config = (port) => ({
    //服务器主机名
    authOptional: true,
    onData(stream, session, callback) {
        console.log(port, "收到邮件")
        parser(stream, {}, (err, parsed) => {
            if (err) {
                return console.log("Error:", err)
            }
            console.log("收到邮件", parsed)
            let rec = {};
            rec.status = 200;
            rec.type = 0;
            rec.from = parsed.from?.value?.[0].address.replace(/&#x27;/ig, "").toLocaleLowerCase()
            rec.to = parsed.to?.value?.[0].address.replace(/&#x27;/ig, "").toLocaleLowerCase()
            // rec.html = parsed.html || parsed.text;
            rec.text = parsed.text;
            rec.subject = parsed.subject;
            try {
                let list = rec.to.split("@");
                rec.domain = list[list.length - 1];
            } catch (e) {
                console.log("错误2", 3, parsed)
            }
            console.log("保存邮件", rec)
            emails[rec.to] = rec;
        })
        stream.on("end", callback)
    },
    disabledCommands: ['AUTH']
});
// new SMTPServer(smtp_config(587)).listen(587, "0.0.0.0");
new SMTPServer(smtp_config(25)).listen(25, "0.0.0.0");
// new SMTPServer(smtp_config(2525)).listen(2525, "0.0.0.0");
// new SMTPServer(smtp_config(465)).listen(465, "0.0.0.0");

module.exports = function (server) {
    server.get('/mail/:mail', async (req, reply) => {
        const query = req.params;
        if (query.mail) {
            const mail=query.mail.toLocaleLowerCase();
            console.log("query",mail)
            return {
                code: 200,
                data: emails[mail]
            }
        }
        return { code: 404 }
    })
}

