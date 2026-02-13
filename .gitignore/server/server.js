import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/create-checkout-session", async (req, res) => {
  const { items } = req.body;

  const line_items = items.map(i => ({
    price_data: {
      currency: "eur",
      product_data: { name: `${i.name} — ${i.size}` },
      unit_amount: i.price * 100
    },
    quantity: 1
  }));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items,
    mode: "payment",
    success_url: "http://localhost:5500/success.html",
    cancel_url: "http://localhost:5500/panier.html"
  });

  res.json({ url: session.url });
});

app.listen(4242, () => console.log("Stripe server running on 4242"));
