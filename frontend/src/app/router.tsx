// src/app/router.tsx
import { createBrowserRouter, Outlet } from "react-router-dom";

import { MainLayout } from "../layouts/MainLayout";
import RequireAuth from "./RequireAuth";

import Splash from "../pages/Splash";
import Onboarding from "../pages/Onboarding";
import GetStarted from "../pages/GetStarted";

import Login from "../pages/Login";
import Register from "../pages/Register";
import Verify from "../pages/Verify";
import SignUpSuccess from "../pages/SignUpSuccess";

import Home from "../pages/Home";
import Search from "../pages/Search";
import Store from "../pages/Store";
import Cart from "../pages/Cart";
import Profile from "../pages/Profile";
import Checkout from "../pages/Checkout";
import CheckoutSuccess from "../pages/CheckoutSuccess";
import ForgotPassword from "../pages/ForgotPassword";
import ForgotVerify from "../pages/ForgotVerify";
import ResetPassword from "../pages/ResetPassword";
import ResetPasswordSuccess from "../pages/ResetPasswordSuccess";
import Logout from "../pages/Logout";
import Categories from "../pages/Categories";
import CategoryDetail from "../pages/CategoryDetail";
import Orders from "../pages/Orders";
import OrderAccepted from "../pages/OrderAccepted";
import TrackOrder from "../pages/TrackOrder";
import Wallet from "../pages/Wallet";
import AddPaymentMethod from "../pages/AddPaymentMethod";
import AddCard from "../pages/AddCard";
import CardDetails from "../pages/CardDetails";
import LegalPlaceholder from "../pages/LegalPlaceholder";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Outlet />,
    children: [
      // públicos
      { path: "splash", element: <Splash /> },
      { path: "onboarding", element: <Onboarding /> },
      { path: "get-started", element: <GetStarted /> },
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      { path: "verify", element: <Verify /> },
      { path: "signup-success", element: <SignUpSuccess /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "forgot-password/verify", element: <ForgotVerify /> },
      { path: "reset-password", element: <ResetPassword /> },
      { path: "reset-success", element: <ResetPasswordSuccess /> },
      { path: "legal/terms", element: <LegalPlaceholder /> },
      { path: "legal/privacy", element: <LegalPlaceholder /> },
      

      // privados
      {
        element: <RequireAuth />,
        children: [
          {
            element: <MainLayout />,
            children: [
              { index: true, element: <Home /> },

              { path: "search", element: <Search /> },
              { path: "store/:storeId", element: <Store /> },
              { path: "cart", element: <Cart /> },
              { path: "categories", element: <Categories /> },
              {
                path: "categories/:supermarketId/:categorySlug",
                element: <CategoryDetail />,
              },
              { path: "profile", element: <Profile /> },
              { path: "checkout", element: <Checkout /> },
              { path: "checkout/success", element: <CheckoutSuccess /> },
              { path: "logout", element: <Logout /> },
              { path: "orders", element: <Orders /> },
              { path: "orders/:orderId/accepted", element: <OrderAccepted /> },
              { path: "orders/:orderId/track", element: <TrackOrder /> },

              { path: "wallet", element: <Wallet /> },
              { path: "wallet/add-method", element: <AddPaymentMethod /> },
              { path: "wallet/add-card", element: <AddCard /> },
              { path: "wallet/card/:cardId", element: <CardDetails /> },
            ],
          },
        ],
      },
    ],
  },
]);