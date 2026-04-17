# 🍽 Restaurant App

A full-stack restaurant management system with a React Native mobile app and Node.js backend.

---

## Tech Stack

| Part     | Technology            |
|----------|-----------------------|
| Backend  | Node.js + Express     |
| Database | PostgreSQL             |
| Mobile   | React Native          |
| Auth     | JWT (JSON Web Tokens) |

---

## Project Structure

```
restaurant-app/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js          ← Database connection
│   │   │   └── schema.sql     ← Full DB schema (run this first)
│   │   ├── middleware/
│   │   │   └── auth.js        ← JWT auth + role check
│   │   ├── routes/
│   │   │   ├── auth.js        ← Login / Register
│   │   │   ├── users.js       ← Staff management
│   │   │   ├── permissions.js ← Waitress permissions
│   │   │   ├── tables.js      ← Table management
│   │   │   ├── menu.js        ← Menu items & categories
│   │   │   ├── orders.js      ← Orders (create, pay, status)
│   │   │   ├── inventory.js   ← Stock management
│   │   │   ├── suppliers.js   ← Suppliers & purchase orders
│   │   │   ├── accounting.js  ← P&L, expenses, cash flow, tax
│   │   │   ├── shifts.js      ← Clock in/out, payroll
│   │   │   ├── notifications.js
│   │   │   └── reports.js     ← Dashboard, best sellers, performance
│   │   └── server.js          ← Main server entry point
│   ├── .env.example
│   └── package.json
└── mobile/
    ├── App.js                 ← Root component
    ├── src/
    │   ├── api/
    │   │   └── client.js      ← All API calls
    │   ├── context/
    │   │   └── AuthContext.js ← Login state
    │   ├── navigation/
    │   │   ├── AppNavigator.js
    │   │   ├── OwnerNavigator.js
    │   │   ├── AdminNavigator.js
    │   │   └── WaitressNavigator.js
    │   └── screens/
    │       ├── LoginScreen.js
    │       ├── owner/
    │       │   ├── OwnerDashboard.js
    │       │   ├── OwnerReports.js
    │       │   ├── OwnerStaff.js
    │       │   ├── OwnerAccounting.js
    │       │   └── OwnerSettings.js
    │       ├── admin/
    │       │   ├── AdminDashboard.js
    │       │   ├── AdminMenu.js
    │       │   ├── AdminInventory.js
    │       │   ├── AdminStaff.js
    │       │   └── AdminOrders.js
    │       └── waitress/
    │           ├── WaitressTables.js
    │           ├── WaitressActiveOrders.js
    │           ├── WaitressNotifications.js
    │           └── WaitressProfile.js
    └── package.json
```

---

## Setup Instructions

### Step 1: Set up PostgreSQL

1. Install PostgreSQL on your computer or use a cloud service (Supabase, Railway, Neon — all free)
2. Create a database:
   ```sql
   CREATE DATABASE restaurant_db;
   ```
3. Run the schema file:
   ```bash
   psql -U your_user -d restaurant_db -f backend/src/config/schema.sql
   ```

### Step 2: Configure Backend

1. Go into the backend folder:
   ```bash
   cd backend
   ```
2. Copy the env file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and fill in:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/restaurant_db
   JWT_SECRET=any_long_random_string_here
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start the server:
   ```bash
   npm run dev
   ```
   Server will run on `http://localhost:5000`

6. Create your first owner account (run this once):
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Your Name","email":"owner@restaurant.com","password":"yourpassword","role":"owner"}'
   ```

### Step 3: Set up React Native (Mobile App)

1. Install React Native CLI:
   ```bash
   npm install -g react-native-cli
   ```
2. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
3. Open `mobile/src/api/client.js` and change the API URL to your server's IP:
   ```js
   const API_BASE_URL = 'http://YOUR_SERVER_IP:5000/api';
   ```
   (Use your computer's local IP, e.g. `http://192.168.1.100:5000/api`)

4. Run on Android:
   ```bash
   npx react-native run-android
   ```
   Run on iOS:
   ```bash
   npx react-native run-ios
   ```

---

## Features by Role

### 👑 Owner
- Full P&L reports, revenue, expenses, profit margin
- Staff management (create, manage all roles)
- Sales analytics and best-seller reports
- Waitress performance reports
- Cash flow management
- Tax settings

### 🔧 Admin
- Menu management (add/edit/delete items & categories)
- Inventory & stock tracking with low-stock alerts
- Waitress permission control (16 granular permissions)
- Order monitoring & status management
- Supplier & purchase order management

### 👩‍🍳 Waitress
- Take orders from phone (no POS needed)
- View all her assigned tables
- Send orders directly to kitchen
- Collect payments (cash/card)
- Split bills
- Receive push notifications
- Clock in/out for shifts

---

## API Endpoints Summary

| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| POST   | /api/auth/login                 | Login                    |
| GET    | /api/tables                     | Get all tables           |
| PUT    | /api/tables/:id/open            | Open a table             |
| GET    | /api/menu/items                 | Get menu items           |
| POST   | /api/orders                     | Create new order         |
| PUT    | /api/orders/:id/status          | Update order status      |
| PUT    | /api/orders/:id/pay             | Process payment          |
| GET    | /api/accounting/pnl             | P&L report               |
| GET    | /api/accounting/sales           | Sales summary            |
| POST   | /api/accounting/expenses        | Add expense              |
| GET    | /api/reports/dashboard          | Owner dashboard data     |
| PUT    | /api/permissions/:userId        | Update waitress perms    |
| POST   | /api/shifts/clock-in            | Clock in                 |
| GET    | /api/shifts/payroll             | Payroll summary          |

---

## Next Steps (Recommended)

1. **Add WebSockets** for real-time kitchen updates (socket.io)
2. **Add receipt printing** (bluetooth thermal printer support)
3. **Add image upload** for menu items (using Cloudinary)
4. **Deploy backend** to Railway, Render, or DigitalOcean
5. **Publish to App Store / Google Play** when ready
