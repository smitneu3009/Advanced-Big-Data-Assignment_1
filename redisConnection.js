const redis = require('redis');

const client = redis.createClient({
    password: 'Z7V0AnTjFOJJzbEeaaBNwhRcQBUxDxBb',
    socket: {
        host: 'redis-19403.c15.us-east-1-4.ec2.redns.redis-cloud.com',
        port: 19403
    }
});

client.on('connect', () => {
    console.log('Connected to Redis Cloud');
});

client.on('error', (err) => {
    console.error('Redis Client Error', err);
});

client.connect();

module.exports = client;
