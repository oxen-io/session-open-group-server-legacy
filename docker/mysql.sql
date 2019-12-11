# create databases
CREATE DATABASE IF NOT EXISTS `lmpc_platform`;
CREATE DATABASE IF NOT EXISTS `lmpc_overlay`;

# create root user and grant rights
# CREATE USER 'root'@'localhost' IDENTIFIED BY 'local';
# GRANT ALL ON *.* TO 'root'@'%';

# primary
CREATE USER 'platform'@'%' IDENTIFIED BY 'publicchat_test';
GRANT ALL ON lmpc_platform.* TO 'platform'@'%';

# secondary
CREATE USER 'overlay'@'%' IDENTIFIED BY 'publicchat_test';
GRANT ALL ON lmpc_overlay.* TO 'overlay'@'%';

