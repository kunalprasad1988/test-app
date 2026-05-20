const bcrypt = require('bcryptjs');
const { prepare } = require('./db');

async function seed() {
  const admin = await prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const adminPass = bcrypt.hashSync('admin123', 10);
    await prepare('INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)').run('admin', adminPass, 'admin', 'Administrator');
    console.log('Admin created: admin / admin123');
  }

  const testCount = +(await prepare('SELECT COUNT(*) as c FROM tests').get()).c;
  if (testCount === 0) {
    await prepare('INSERT INTO tests (title, description, duration_minutes, max_violations, is_published, randomize_questions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run('Cloud & Linux Basics', 'Sample assessment covering AWS, Linux, and networking fundamentals', 30, 5, 1, 1, 1);

    const test = await prepare('SELECT id FROM tests LIMIT 1').get();
    const questions = [
      ['What does EC2 stand for in AWS?', 'Elastic Compute Cloud', 'Electronic Computer Cloud', 'Elastic Cloud Computing', 'Enterprise Compute Cloud', 'a', 1],
      ['Which AWS service is used for object storage?', 'EBS', 'S3', 'RDS', 'DynamoDB', 'b', 1],
      ['What is the default port for SSH?', '21', '22', '80', '443', 'b', 1],
      ['Which AWS service provides managed relational databases?', 'S3', 'Lambda', 'RDS', 'CloudFront', 'c', 1],
      ['What does IAM stand for?', 'Internet Access Management', 'Identity and Access Management', 'Internal Account Manager', 'Integrated Auth Module', 'b', 1],
      ['Which protocol does HTTPS use for encryption?', 'SSH', 'TLS/SSL', 'FTP', 'SMTP', 'b', 1],
      ['What is the purpose of a Security Group in AWS?', 'Manage users', 'Firewall for EC2 instances', 'Store secrets', 'Monitor logs', 'b', 1],
      ['Which Linux command shows running processes?', 'ls', 'top', 'cd', 'mkdir', 'b', 1],
      ['What is the maximum size of an S3 object?', '1 GB', '5 TB', '10 TB', 'Unlimited', 'b', 1],
      ['Which AWS service is serverless compute?', 'EC2', 'Lambda', 'ECS', 'Lightsail', 'b', 1],
      ['What does DNS stand for?', 'Domain Name System', 'Data Network Service', 'Digital Name Server', 'Domain Node System', 'a', 1],
      ['Which command is used to change file permissions in Linux?', 'chmod', 'chown', 'chgrp', 'chdir', 'a', 1],
      ['What is a VPC in AWS?', 'Virtual Private Cloud', 'Virtual Public Cloud', 'Virtual Protected Container', 'Virtual Private Container', 'a', 1],
      ['Which HTTP status code means Not Found?', '200', '301', '404', '500', 'c', 1],
      ['What is the purpose of CloudWatch in AWS?', 'Compute', 'Monitoring and logging', 'Storage', 'Networking', 'b', 1]
    ];
    for (const q of questions) {
      await prepare('INSERT INTO questions (test_id, question_text, option_a, option_b, option_c, option_d, correct_answer, marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(test.id, ...q);
    }
    console.log('Sample test with 15 questions created and published.');
  } else {
    console.log('Database already has tests.');
  }
}

module.exports = { seed };
