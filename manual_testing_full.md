# HydraGateway - Manual Testing Guide (Part 1)

---

# Prerequisites

## Start Memurai

```bash
memurai-cli
```

Check Redis

```redis
PING
```

Expected

```
PONG
```

---

## MongoDB Atlas

Open Atlas

Browse Collections

Database

```
hydragateway
```

Collections

```
users
products
orders
payments
```

---

## Start Services

Terminal 1

```bash
npm run dev:gateway
```

Terminal 2

```bash
npm run dev:auth
```

Terminal 3

```bash
npm run dev:product
```

Terminal 4

```bash
npm run dev:payment
```

Terminal 5

```bash
npm run dev:order
```

---

# API 1 - Health Check

## Postman

Method

```
GET
```

URL

```
http://localhost:3000/health
```

Authorization

```
None
```

Expected

```
200 OK
```

---

## Verify Logs

Gateway

```
GET /health
```

Auth

```
Health Check
```

Product

```
Health Check
```

Payment

```
Health Check
```

Order

```
Health Check
```

---

## MongoDB

No Changes

---

## Redis

```redis
KEYS *
```

No cache keys expected.

---

# API 2 - Register User

Method

```
POST
```

URL

```
http://localhost:3000/v1/auth/register
```

Headers

```
Content-Type: application/json
```

Authorization

```
None
```

Body

```json
{
    "name":"Nitant Jain",
    "email":"nitant@test.com",
    "password":"password123"
}
```

Expected

```
201 Created
```

Copy JWT Token

---

## Verify Gateway

```
POST /v1/auth/register
```

---

## Verify Auth

```
POST /v1/auth/register
201
```

---

## MongoDB

Collection

```
users
```

Verify

```
name

email

password

createdAt

updatedAt
```

Password must be hashed

```
$2b$10....
```

---

## Redis

```redis
KEYS *
```

No cache keys expected.

---

# API 3 - Login

Method

```
POST
```

URL

```
http://localhost:3000/v1/auth/login
```

Headers

```
Content-Type: application/json
```

Body

```json
{
    "email":"nitant@test.com",
    "password":"password123"
}
```

Expected

```
200 OK
```

Copy JWT Token

Save in Postman

```
{{token}}
```

---

## Verify Gateway

```
POST /v1/auth/login
```

---

## Verify Auth

```
POST /v1/auth/login
200
```

---

## MongoDB

Collection

```
users
```

Verify

```
lastLoginAt
```

Updated

---

## Redis

```redis
KEYS *
```

Nothing related to auth.

---

# API 4 - Current User

Method

```
GET
```

URL

```
http://localhost:3000/v1/auth/me
```

Authorization

```
Bearer {{token}}
```

Expected

```
200 OK
```

---

## Verify Gateway

```
GET /v1/auth/me

Authenticated User ID
```

---

## Verify Auth

```
GET /v1/auth/me
200
```

---

## MongoDB

Only Read Operation

No document changes.

---

## Redis

```redis
KEYS *
```

No auth cache expected.

---

# API 5 - Create Product

Method

```
POST
```

URL

```
http://localhost:3000/v1/products
```

Authorization

```
Bearer {{token}}
```

Headers

```
Content-Type: application/json
```

Body

```json
{
    "name":"MacBook Pro M4",
    "description":"Apple Laptop",
    "price":199999,
    "category":"Electronics",
    "stock":10
}
```

Expected

```
201 Created
```

Copy Product ID

---

## Verify Gateway

```
POST /v1/products
```

---

## Verify Product Service

```
POST /v1/products
201
```

---

## MongoDB

Collection

```
products
```

Verify

```
name

price

category

stock

createdAt

updatedAt
```

---

## Redis

```redis
KEYS *
```

Cache may not exist yet.

---

# API 6 - Get Products (First Request)

Method

```
GET
```

URL

```
http://localhost:3000/v1/products
```

Authorization

```
Bearer {{token}}
```

Expected

```
200 OK
```

---

## Gateway

Expected

```
Cache MISS
```

---

## Product Service

```
GET /v1/products
200
```

---

## MongoDB

Read Only

---

## Redis

```redis
KEYS *
```

Expected (if cache works)

```
cache:products:all
```

Check TTL

```redis
TTL cache:products:all
```

Check Data

```redis
GET cache:products:all
```

---

# API 7 - Get Products (Second Request)

Immediately send

```
GET
http://localhost:3000/v1/products
```

Authorization

```
Bearer {{token}}
```

Expected

```
200 OK
```

---

## Gateway

Expected

```
Cache HIT
```

---

## Product Service

Should NOT receive request.

---

## MongoDB

No Query

---

## Redis

```redis
KEYS *
```

```redis
TTL cache:products:all
```

---

# Useful Redis Commands

Show Keys

```redis
KEYS *
```

Get Value

```redis
GET <key>
```

TTL

```redis
TTL <key>
```

Delete Key

```redis
DEL <key>
```

Delete Everything

```redis
FLUSHDB
```

Redis Info

```redis
INFO
```

Connected Clients

```redis
CLIENT LIST
```

---

# MongoDB Verification

users

```
password

lastLoginAt
```

products

```
name

price

stock

category
```

orders

```
status

paymentId
```

payments

```
transactionId

status

amount
```

---

# Request Flow Summary

## Register

```
Client

↓

Gateway

↓

Auth

↓

MongoDB

↓

Gateway

↓

Client
```

---

## Login

```
Client

↓

Gateway

↓

Auth

↓

MongoDB

↓

Gateway

↓

Client
```

---

## Auth Me

```
Client

↓

Gateway

↓

JWT Verify

↓

Auth

↓

MongoDB

↓

Gateway

↓

Client
```

---

## Create Product

```
Client

↓

Gateway

↓

JWT Verify

↓

Product

↓

MongoDB

↓

Redis DEL

↓

Gateway

↓

Client
```

---

## Get Products

```
Client

↓

Gateway

↓

Redis GET

↓

MISS

↓

Product

↓

MongoDB

↓

Redis SET

↓

Gateway

↓

Client
```

Second Request

```
Client

↓

Gateway

↓

Redis GET

↓

HIT

↓

Client
```