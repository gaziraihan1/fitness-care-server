# 🏋️‍♂️ Gym Management System – Backend

This is the **backend** for the Gym Management System, built with **Node.js**, **Express.js**, **MongoDB**, and secured using **JWT authentication**.  
It provides APIs for trainers, classes, forums, newsletters, bookings, and more.

---

## 🌍 Live Backend / API
👉 **Live API URL:** [https://your-backend-host.onrender.com](https://your-backend-host.onrender.com)  
*(replace with your deployed URL if available)*

---

## ✨ Features
✅ Secure authentication using **JWT** (JSON Web Token) for both email/password and social login.  
✅ Role-based authorization (**member**, **trainer**, **admin**).  
✅ Private and protected routes returning **401** and **403** as needed.  
✅ RESTful APIs for:
- 📌 Trainers (list, details)
- 📌 Classes (featured, list, add)
- 📌 Bookings (book trainer, track activity)
- 📌 Forums / Community Posts (create, fetch latest, vote)
- 📌 Newsletters (subscribe and manage)
- 📌 Payments (Payments details)
✅ Pagination support for large datasets.  
✅ Sorting and filtering (latest forum posts, featured classes).  
✅ Proper MongoDB data structures with timestamps and voters arrays for upvotes/downvotes.

---

## 🛠 Tech Stack
- **Node.js**
- **Express.js**
- **MongoDB** (Native driver or Mongoose)
- **JWT (jsonwebtoken)**
- **bcrypt**
- **dotenv**
- **CORS** & **Helmet** for security
- **Nodemon** for development

---

### ⚡ Frontend Setup
# clone repo

```
git clone https://github.com/Programming-Hero-Web-Course4/b11a12-client-side-gaziraihan1.git
cd b11a12-client-side-gaziraihan1
```
# install dependencies
```
npm install
```

# start development
```
npm run dev
```

### ⚡ Backend Setup

# Clone
```
git clone https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-gaziraihan1.git
cd b11a12-server-side-gaziraihan1
```

# Install dependencies
```
npm install
```

# Create a .env file in the root of this folder with the following keys:
```
MONGO_NAME=
MONGO_PASS=
JWT_SECRET=
SECRET_KEY_STRIPE=

```

# Run in development mode
```
nodemon index.js
```
