const SMTPServer = require("smtp-server").SMTPServer;
const parser = require("mailparser").simpleParser;
const psl = require('psl');
const fs = require('fs');
const path = require('path');

const emails = {};
const emailsFilePath = path.join(process.cwd(), '/data/emails.json');

// 确保数据目录存在
function ensureDataDir() {
    const dataDir = path.dirname(emailsFilePath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// 从文件加载邮件数据
function loadEmails() {
    try {
        ensureDataDir();
        if (fs.existsSync(emailsFilePath)) {
            const data = fs.readFileSync(emailsFilePath, 'utf8');
            const loadedEmails = JSON.parse(data);
            Object.assign(emails, loadedEmails);
            console.log(`加载了 ${Object.keys(loadedEmails).length} 封邮件`);
        } else {
            console.log('邮件数据文件不存在，将创建新文件');
        }
    } catch (error) {
        console.error('加载邮件数据失败:', error);
    }
}

// 保存邮件数据到文件
function saveEmails() {
    try {
        ensureDataDir();
        fs.writeFileSync(emailsFilePath, JSON.stringify(emails, null, 2), 'utf8');
        console.log(`保存了 ${Object.keys(emails).length} 封邮件到文件`);
    } catch (error) {
        console.error('保存邮件数据失败:', error);
    }
}

// 启动时加载邮件
loadEmails();

// 定期保存邮件（可选，防止数据丢失）
setInterval(saveEmails, 60000); // 每分钟保存一次

// 优雅关闭时保存数据
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    saveEmails();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n正在关闭服务器...');
    saveEmails();
    process.exit(0);
});
const smtp_config = (port) => ({
    //服务器主机名
    authOptional: true,
    secure: false,
    onData(stream, session, callback) {
        parser(stream, {}, (err, parsed) => {
            if (err) {
                return console.log("Error:", err)
            }
            console.log("收到邮件", parsed)
            let rec = {};
            rec.status = 200;
            rec.type = 0;
            rec.from = parsed.from?.value?.[0]?.address?.replace(/&#x27;/ig, "")?.toLocaleLowerCase()
            rec.to = parsed.to?.value?.[0]?.address?.replace(/&#x27;/ig, "")?.toLocaleLowerCase()
            rec.html = parsed.html;
            rec.text = parsed.text;
            rec.subject = parsed.subject;
            rec.date = new Date(parsed.date).getTime();
            rec.messageId = parsed.messageId;
            try {
                let list = rec.to.split("@");
                rec.domain = list[list.length - 1];
            } catch (e) {
                console.log("错误2", 3, parsed)
            }
            console.log("保存邮件", rec)
            emails[rec.to] = rec;
            // 保存到文件
            saveEmails();
        })
        stream.on("end", callback)
    },
    disabledCommands: ['AUTH']
});
// new SMTPServer(smtp_config(587)).listen(587, "0.0.0.0");
new SMTPServer(smtp_config(25)).listen(25, "0.0.0.0");
// new SMTPServer(smtp_config(2525)).listen(2525, "0.0.0.0");
// new SMTPServer(smtp_config(465)).listen(465, "0.0.0.0");
function getMainDomain(hostname) {
    if (!hostname) return hostname;
    const host = hostname.split(':')[0];
    const parsed = psl.parse(host);
    return parsed.domain || host;
}
function parseMail(mail, req) {
    mail = mail.toLocaleLowerCase();
    if (!mail.includes("@")) {
        mail += "@" + getMainDomain(req.headers.host);
    }
    return mail;
}
module.exports = function (server) {
    server.get('/api/:mail', async (req, reply) => {
        const query = req.params;
        if (query.mail) {
            let mail = parseMail(query.mail, req);
            return {
                code: 200,
                data: emails[mail]
            }
        }
        return { code: 404 }
    })
    server.get('/web/:mail', async (req, reply) => {
        const query = req.params;
        reply.header("Content-Type", "text/html; charset=utf-8");
        if (query.mail) {
            const mail = parseMail(query.mail, req);
            const email = emails[mail];
            if (email) {
                return [
                    `<html><body>`,
                    `<div style="font-size:22px;font-weight:bold;">${email.subject}</div>`,
                    `<div style="font-size:14px;">`,
                    `From: ${email.from}<br/>`,
                    `To: ${email.to}<br/>`,
                    `Date: ${email.date ? new Date(email.date).toLocaleString("zh-CN") : ''}`,
                    `</div>`,
                    `<hr/>`,
                    `<div>${email.html}</div>`,
                    `</body></html>`
                ].join("")
            }
        }
        reply.status(404);
        return `<html><body><h1>没有找到邮件</h1></body></html>`;
    })

    // 获取所有邮件列表
    server.get('/api/emails', async (req, reply) => {
        return {
            code: 200,
            data: Object.keys(emails).map(key => ({
                to: key,
                from: emails[key].from,
                subject: emails[key].subject,
                domain: emails[key].domain
            }))
        }
    })

    // 删除指定邮件
    server.delete('/api/:mail', async (req, reply) => {
        const query = req.params;
        if (query.mail) {
            const mail = parseMail(query.mail, req);
            if (emails[mail]) {
                delete emails[mail];
                saveEmails();
                return { code: 200, message: '邮件已删除' }
            }
            return { code: 404, message: '邮件不存在' }
        }
        return { code: 400, message: '无效的邮件地址' }
    })

    // 清空所有邮件
    server.delete('/api/emails/clear', async (req, reply) => {
        const count = Object.keys(emails).length;
        Object.keys(emails).forEach(key => delete emails[key]);
        saveEmails();
        return { code: 200, message: `已清空 ${count} 封邮件` }
    })

    //默认跳转到首页
    server.get('/:mail', async (req, reply) => {
        reply.redirect('/web/' + req.params.mail);
    });
}

