### 邮箱接口系统

将收到和发送的邮件存到数据库，
本系统使用自定义域名邮箱发送和接收。
主要是开放接口给自己的程序使用。

### 域名解析
```
TXT
_dmarc
v=DMARC1; p=none; pct=100; rua=mailto:dmarc@domain.top
```
```
MX
@
domain.com
```

### 关闭其他邮件
```
//查看状态
systemctl list-unit-files | grep post
//关闭
systemctl disable --now postfix.service
```

### 无法监听
```
//提高nodejs权限
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/node

//关闭其他占用进程
sudo kill -9 `sudo lsof -t -i:25`

//添加防火墙
firewall-cmd --zone=public --add-port=2525/tcp --permanent

//重启防火墙
systemctl restart firewalld.service

//查看打开端口
firewall-cmd --zone=public --list-ports
```