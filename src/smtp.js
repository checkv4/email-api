const SMTPServer = require("smtp-server").SMTPServer;
const parser = require("mailparser").simpleParser;
const fs = require("fs");
const path = require("path");

// Optimized email storage structure
const emailStorage = {
    // Index by recipient email for quick lookup
    byRecipient: new Map(),
    // Index by sender email 
    bySender: new Map(),
    // All emails with unique IDs
    allEmails: new Map(),
    // Counter for generating unique IDs
    nextId: 1
};

// Load existing emails from storage file
const storageFile = path.join(__dirname, '../data/emails.json');
function loadEmails() {
    try {
        if (fs.existsSync(storageFile)) {
            const data = fs.readFileSync(storageFile, 'utf8');
            const loaded = JSON.parse(data);
            
            // Restore email storage structure
            if (loaded.allEmails) {
                for (const [id, email] of Object.entries(loaded.allEmails)) {
                    emailStorage.allEmails.set(id, email);
                    
                    // Rebuild indexes
                    if (email.addresses && email.addresses.to) {
                        if (!emailStorage.byRecipient.has(email.addresses.to)) {
                            emailStorage.byRecipient.set(email.addresses.to, []);
                        }
                        emailStorage.byRecipient.get(email.addresses.to).push(id);
                    }
                    
                    if (email.addresses && email.addresses.from) {
                        if (!emailStorage.bySender.has(email.addresses.from)) {
                            emailStorage.bySender.set(email.addresses.from, []);
                        }
                        emailStorage.bySender.get(email.addresses.from).push(id);
                    }
                }
                emailStorage.nextId = loaded.nextId || 1;
            }
            console.log(`Loaded ${emailStorage.allEmails.size} emails from storage`);
        }
    } catch (err) {
        console.log("Could not load emails from storage:", err.message);
    }
}

// Save emails to storage file
function saveEmails() {
    try {
        // Ensure data directory exists
        const dataDir = path.dirname(storageFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Convert Maps to Objects for JSON serialization
        const toSave = {
            allEmails: Object.fromEntries(emailStorage.allEmails),
            nextId: emailStorage.nextId,
            savedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(storageFile, JSON.stringify(toSave, null, 2));
    } catch (err) {
        console.log("Could not save emails to storage:", err.message);
    }
}

// Load emails on startup
loadEmails();
const smtp_config = (port) => ({
    //服务器主机名
    authOptional: true,
    secure:false,
    onData(stream, session, callback) {
        console.log(port, "收到邮件")
        parser(stream, {}, (err, parsed) => {
            if (err) {
                return console.log("Error:", err)
            }
            console.log("收到邮件", parsed)
            
            // Generate unique email ID
            const emailId = `${Date.now()}-${emailStorage.nextId++}`;
            
            // Create optimized email record structure
            const emailRecord = {
                id: emailId,
                timestamp: new Date().toISOString(),
                metadata: {
                    status: 200,
                    type: 0,
                    receivedAt: new Date().toISOString(),
                    port: port
                },
                addresses: {
                    from: parsed.from?.value?.[0]?.address?.replace(/&#x27;/ig, "")?.toLowerCase() || null,
                    to: parsed.to?.value?.[0]?.address?.replace(/&#x27;/ig, "")?.toLowerCase() || null
                },
                content: {
                    subject: parsed.subject || "",
                    html: parsed.html || "",
                    text: parsed.text || ""
                }
            };
            
            // Add domain information
            try {
                if (emailRecord.addresses.to) {
                    let list = emailRecord.addresses.to.split("@");
                    emailRecord.addresses.domain = list[list.length - 1];
                }
            } catch (e) {
                console.log("域名解析错误", e, parsed);
            }
            
            // Store email in optimized storage structure
            emailStorage.allEmails.set(emailId, emailRecord);
            
            // Update recipient index
            if (emailRecord.addresses.to) {
                if (!emailStorage.byRecipient.has(emailRecord.addresses.to)) {
                    emailStorage.byRecipient.set(emailRecord.addresses.to, []);
                }
                emailStorage.byRecipient.get(emailRecord.addresses.to).push(emailId);
            }
            
            // Update sender index  
            if (emailRecord.addresses.from) {
                if (!emailStorage.bySender.has(emailRecord.addresses.from)) {
                    emailStorage.bySender.set(emailRecord.addresses.from, []);
                }
                emailStorage.bySender.get(emailRecord.addresses.from).push(emailId);
            }
            
            console.log("保存邮件", { id: emailId, to: emailRecord.addresses.to, from: emailRecord.addresses.from });
            
            // Save to persistent storage (async, don't block email processing)
            setImmediate(() => saveEmails());
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
    // Original API endpoint - maintains backward compatibility
    server.get('/mail/:mail', async (req, reply) => {
        const query = req.params;
        if (query.mail) {
            const mail = query.mail.toLowerCase();
            console.log("查询邮件", mail);
            
            // Get emails for this recipient
            const emailIds = emailStorage.byRecipient.get(mail) || [];
            if (emailIds.length === 0) {
                return { code: 404, message: "No emails found" };
            }
            
            // Get the most recent email (backward compatibility)
            const latestEmailId = emailIds[emailIds.length - 1];
            const latestEmail = emailStorage.allEmails.get(latestEmailId);
            
            if (!latestEmail) {
                return { code: 404, message: "Email not found" };
            }
            
            // Convert to old format for backward compatibility
            const compatibleFormat = {
                status: latestEmail.metadata.status,
                type: latestEmail.metadata.type,
                from: latestEmail.addresses.from,
                to: latestEmail.addresses.to,
                html: latestEmail.content.html,
                text: latestEmail.content.text,
                subject: latestEmail.content.subject,
                domain: latestEmail.addresses.domain,
                // Add new fields for enhanced functionality
                id: latestEmail.id,
                timestamp: latestEmail.timestamp,
                receivedAt: latestEmail.metadata.receivedAt
            };
            
            return {
                code: 200,
                data: compatibleFormat
            };
        }
        return { code: 404, message: "Email parameter required" };
    });
    
    // New API endpoint - get all emails for a recipient
    server.get('/mails/:mail', async (req, reply) => {
        const query = req.params;
        if (query.mail) {
            const mail = query.mail.toLowerCase();
            console.log("查询所有邮件", mail);
            
            const emailIds = emailStorage.byRecipient.get(mail) || [];
            const emails = emailIds.map(id => emailStorage.allEmails.get(id))
                .filter(email => email) // Remove any null/undefined emails
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort by timestamp, newest first
            
            return {
                code: 200,
                count: emails.length,
                data: emails
            };
        }
        return { code: 404, message: "Email parameter required" };
    });
    
    // New API endpoint - get email by ID
    server.get('/mail/id/:id', async (req, reply) => {
        const emailId = req.params.id;
        if (emailId) {
            const email = emailStorage.allEmails.get(emailId);
            if (email) {
                return {
                    code: 200,
                    data: email
                };
            }
        }
        return { code: 404, message: "Email not found" };
    });
    
    // New API endpoint - get storage statistics
    server.get('/stats', async (req, reply) => {
        return {
            code: 200,
            data: {
                totalEmails: emailStorage.allEmails.size,
                totalRecipients: emailStorage.byRecipient.size,
                totalSenders: emailStorage.bySender.size,
                nextId: emailStorage.nextId
            }
        };
    });
};

