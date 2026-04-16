// migrate-menu.js
// ONE-TIME SCRIPT — Run this once to populate the menu_items
// table in Supabase with all items from the frontend MENU object
//
// HOW TO RUN:
//   node migrate-menu.js
//
// Run from the root of MotoBite-api folder

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ALL MENU ITEMS — copied from app.js
const MENU = {
  Promos:[
    {id:1001, name:'Streetwise 9 Butter Chicken', price:1990, desc:'9 pcs Butter Chicken + chips', img:'https://glovo.dhmedia.io/image/menus-glovo/products/8114f8df70a749a6b666bce4d1e146e1a6f45e0026a3eb17a1c97b608fe768cd?t=W3sicmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:1002, name:'Mega Wing Box Chicken',        price:790,  desc:'Wings + Butter Chicken combo box', img:'https://glovo.dhmedia.io/image/menus-glovo/products/e1f6b814dd2d1ee2c1397d014fd32aa3bccd0c030a8cb4159cefe776bd015577?t=W3sicmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:1003, name:'Dipping Box',                  price:1990, desc:'6 Wings + 6 Strips + 12 Nuggets + Lrg chips + 3 dipping sauces', img:'https://glovo.dhmedia.io/image/menus-glovo/products/41940fa143d81d7ae2daef32e43b7395dc289902db6458edc5fbf3ad9c2c3fcf?t=W3sicmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:1004, name:'Dipping Box With 1.25L Soda',  price:2200, desc:'6 Wings + 6 Strips + 12 Nuggets + Lrg chips + 1.25L soda + 3 dipping sauces', img:'https://glovo.dhmedia.io/image/menus-glovo/products/e63722651372325e893d134dfdebb451a2808b70a83110fa138f6a27b1599576?t=W3sicmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
  ],
  Streetwise:[
    {id:1,  name:'Streetwise 1',              price:390,  desc:'1pc OR / SPICY + Reg chips', img:'https://glovo.dhmedia.io/image/menus-glovo/products/635c67095267875bcc69f291c4f6260a710263bf6e12462212b1b9916605534a?t=W3sicmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:2,  name:'Streetwise 1 with Rice',    price:390,  desc:'1 pc Original Recipe + Colonel rice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/a9e87805-6236-e07a-6121-ed1485c09cf1.jpeg?a=52c9137d-05ab-0ded-0fff-21c34132e4cb'},
    {id:3,  name:'Streetwise 2',              price:490,  desc:'2pcs OR / SPICY + Colonel Rice or Reg. fries', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/37fd6de8-12ad-4016-ab2e-ef3e491f4ee8.jpeg?a=2f70c603-e474-d115-c163-cf23286fc21b'},
    {id:4,  name:'Streetwise 2 Large',        price:590,  desc:'2pcs OR / SPICY + Lrg. fries', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/37fd6de8-12ad-4016-ab2e-ef3e491f4ee8.jpeg?a=2f70c603-e474-d115-c163-cf23286fc21b'},
    {id:5,  name:'Streetwise 2 Crunch',       price:450,  desc:'2pcs OR / SPICY + Tortilla chips', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/9f60ca25-162c-5872-e514-93615c9430a8.jpeg?a=2875a9d0-f24e-9f95-0c02-05772acc77ff'},
    {id:6,  name:'Streetwise 3',              price:690,  desc:'3pcs OR / SPICY + Reg. fries', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/1185e73b-10f6-f5d6-a3ad-564ce2dc0c09.jpeg?a=a55ab509-2f77-bffb-5bc1-69e8381b26ea'},
    {id:7,  name:'Streetwise 3 with Rice',    price:690,  desc:'3pcs OR / SPICY + Colonel Rice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/9ba70c82-600c-68f5-96bd-5ad7f6a784d2.jpeg?a=8cbc68dc-2d6e-8089-0b7a-ecbfd636dd97'},
    {id:8,  name:'Streetwise 3 Crunch',       price:650,  desc:'3 pcs Original Recipe + Tortilla chips', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/3acb77db-7590-9f73-63cd-5474b569c4d2.jpeg?a=0f0aab3c-3ce6-63cb-3b88-24f51b1b6b84'},
    {id:9,  name:'Streetwise 5',              price:1200, desc:'5pcs OR / SPICY + Lrg. fries', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/d332379d-7387-21b8-75e0-e69787140f20.jpeg?a=1f96a8ba-ee8e-3a9a-7734-f217b5e2b673'},
    {id:10, name:'Streetwise 5 Crunch',       price:1150, desc:'5pcs OR / SPICY + Tortilla chips', img:'https://glovo.dhmedia.io/image/menus-glovo/products/d6d5feb6fc6e552d609e16ccccb772043e1a639ea9a935db223c06a1a293e3b4?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:11, name:'Streetwise 7',              price:1790, desc:'7pc OR / SPICY + Family fries + 1.25l soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/f7479255-3aab-2264-0729-71591251283d.jpeg?a=6d2ac5f0-7591-fb3e-413f-30e36455129f'},
    {id:13, name:'Streetwise 9 Butter Chicken', price:1990, desc:'9 pcs Butter Chicken + chips', img:'https://glovo.dhmedia.io/image/menus-glovo/products/8114f8df70a749a6b666bce4d1e146e1a6f45e0026a3eb17a1c97b608fe768cd?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
  ],
  Burgers:[
    {id:14, name:'Zinger Burger',              price:650,  desc:'Spicy crispy chicken burger', img:'https://glovo.dhmedia.io/image/menus-glovo/products/224fecf2b8bd2cdcab6c80396562b2555e861344b526e3253b211f81a28228fa?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:15, name:'Zinger Burger Meal',         price:850,  desc:'Zinger Burger + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/626d220b-717d-2ae1-ad61-952bf4ab693a.jpeg?a=0792b96a-c2b0-8bde-3490-714534582c64'},
    {id:16, name:'Crunch Burger',              price:470,  desc:'OR / Spicy Crunch chicken burger', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/626d220b-717d-2ae1-ad61-952bf4ab693a.jpeg?a=0792b96a-c2b0-8bde-3490-714534582c64'},
    {id:17, name:'Crunch Burger Meal',         price:650,  desc:'Crunch Burger + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/0226c397-2a2a-2348-bdc6-9f8c6ad1bfd8.jpeg?a=9511d03b-b6f7-ea96-624b-dbaf285b601f'},
    {id:18, name:'Colonel Burger',             price:650,  desc:'Classic Colonel chicken burger', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/e9d5c40f-2fb2-f327-a6fc-f599576167fb.jpeg?a=df731449-20fc-230e-9524-61c570acea1d'},
    {id:19, name:'Colonel Burger Meal',        price:850,  desc:'Colonel Burger + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/542ce49a-9bfe-0bad-eb6e-4c141d98c397.jpeg?a=0efd49ab-e001-a8cf-94b1-f5b55b4686b0'},
    {id:20, name:'Double Crunch Burger',       price:690,  desc:'Double layer crunch chicken burger', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/ca17b332-80a0-f415-9976-6d53be38b216.jpeg?a=50b79314-56ee-0bb4-9637-5a85ec63bb8c'},
    {id:21, name:'Double Crunch Burger Meal',  price:890,  desc:'Double Crunch Burger + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/f8c32194-96f3-49eb-437e-9d33377ee598.jpeg?a=cd6686fe-a21d-9350-64cd-1df38670a232'},
    {id:22, name:'Legend Burger',              price:690,  desc:'The legendary KFC burger', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/3b55a114-a25a-7a06-1b96-60d6002af506.jpeg?a=fdf9f88f-d102-f38a-d750-0e6bbf039073'},
    {id:23, name:'Legend Burger Meal',         price:890,  desc:'Legend Burger + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/7fde61eb-f8c2-371e-ed06-faa9f0f0bf37.jpeg?a=ec46ad65-c649-c487-5cb2-1bf15e90415c'},
    {id:24, name:'Nyama Nyama Burger',         price:850,  desc:'Nyama Nyama chicken burger', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/147575e3-fedf-1acd-cda9-b0ef8f608a78.jpeg?a=3d44471c-8e0c-6ca1-31fe-1918e2f1b623'},
    {id:25, name:'Nyama Nyama Burger Meal',    price:1100, desc:'Nyama Nyama Burger + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/147575e3-fedf-1acd-cda9-b0ef8f608a78.jpeg?a=3d44471c-8e0c-6ca1-31fe-1918e2f1b623'},
    {id:26, name:'Hash Brown Burger',          price:390,  desc:'Vegetarian burger with hashbrown', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/441206d2-05ed-e644-fa66-29c268f4793a.jpeg?a=32d252ba-0fe9-5de6-2e65-bba24d9528c0'},
    {id:27, name:'Hash Brown Burger Meal',     price:590,  desc:'Hash Brown Burger + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/7bd3de7c-781b-6b97-40e9-98b4e6a903c2.jpeg?a=16c5dd64-0087-69f1-9149-633aaadb2923'},
    {id:28, name:'Crunch Burger Lunchbox',     price:850,  desc:'Crunch Burger + chips + coleslaw + 350ml drink', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/0fe58244-9f6f-3e30-76a2-16f52b4e24aa.jpeg?a=aeaf8c49-2900-5bac-a056-05a9c410b52e'},
  ],
  Wraps:[
    {id:29, name:'Box Master',            price:690, desc:'Chicken + chips + soda in a signature box', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/9d97dab9-3597-ced7-895f-b2a491b1d8a8.jpeg?a=e57a07e7-c0a2-afd4-ec76-eb525cd3eb4d'},
    {id:30, name:'Crunch Master Meal',    price:890, desc:'Crunch Master + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/ff816840-9024-bd91-3903-d31dc9a0fe3a.jpeg?a=67932bbb-b46d-f883-f882-4650d6d5f9df'},
    {id:31, name:'Chicken Lunchbox',      price:850, desc:'2 pcs chicken + chips + coleslaw + 350ml drink', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/150e5314-840f-972f-7f5c-ad792e2b3bae.jpeg?a=4b88e727-8054-d93e-8e1a-2004fd44763c'},
    {id:32, name:'Zinger Twister Meal',   price:890, desc:'Zinger Twister wrap + Reg. chips + 500ml soda', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/4b484718-22de-e1dc-1d38-8acfa245e6bb.jpeg?a=964f4874-703e-eb74-7dc4-d8ed54c59643'},
    {id:33, name:'Rice Wrap',             price:290, desc:'Chicken wrapped with seasoned rice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/8e8fcd18-1ca0-bb92-fb58-88c2a35dba8d.jpeg?a=5e75bf3e-1606-5fd9-a78b-42203d2a1e33'},
    {id:34, name:'Nuggets Rice Wrap',     price:290, desc:'Nuggets wrapped with seasoned rice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/bf231566-8a72-222f-b3eb-1eacb1af8750.jpeg?a=f78eb395-33d0-a264-77aa-9d3e3e0fa9e4'},
    {id:35, name:'Wrapstar',              price:350, desc:'Crispy chicken in a soft tortilla wrap', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/c9a9d1fb-4cfe-1d78-2133-d6358565fa9b.jpeg?a=91719fca-f854-802f-9a43-7760f6710812'},
  ],
  Wings:[
    {id:36, name:'Mega Wing Box Butter Chicken', price:790,  desc:'Wings + Butter Chicken sauce + chips + drink', img:'https://glovo.dhmedia.io/image/menus-glovo/products/e1f6b814dd2d1ee2c1397d014fd32aa3bccd0c030a8cb4159cefe776bd015577?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:37, name:'Zinger Wings 4 pc',     price:490,  desc:'4 pcs spicy Zinger wings', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/f70d022b-ba80-5169-9262-f9fa98598a00.jpeg?a=d90e2db2-b7b4-c670-8137-c8831d186ae7'},
    {id:38, name:'Zinger Wings 8 pc',     price:850,  desc:'8 pcs spicy Zinger wings', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/f70d022b-ba80-5169-9262-f9fa98598a00.jpeg?a=d90e2db2-b7b4-c670-8137-c8831d186ae7'},
    {id:39, name:'Zinger Wings 12 pc',    price:1200, desc:'12 pcs spicy Zinger wings', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/f70d022b-ba80-5169-9262-f9fa98598a00.jpeg?a=d90e2db2-b7b4-c670-8137-c8831d186ae7'},
    {id:40, name:'Sticky Wings 4 pc',     price:550,  desc:'4 pcs sweet sticky wings', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/2f050cc5-78ed-2c08-f88c-20893adad2bf.jpeg?a=cfe88558-8b7d-7d9f-6fa2-9894813b3617'},
    {id:41, name:'Sticky Wings 8 pc',     price:890,  desc:'8 pcs sweet sticky wings', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/6bea1fd1-f3d6-53e1-593e-4342229637c7.jpeg?a=b4bcfe80-5e8d-be8b-9523-534b924bf7cc'},
    {id:42, name:'Sticky Wings 12 pc',    price:1290, desc:'12 pcs sweet sticky wings', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/6f24ec42-a0b4-8f54-dcac-253000641726.jpeg?a=4d6b1120-c945-260d-d441-03383e8440e8'},
    {id:43, name:'Wingman',               price:700,  desc:'5 Zinger wings + Reg. chips + 350ml drink', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/6a77a2f9-a52f-3659-3407-7c0da302fcd2.jpeg?a=42fe54a4-3eeb-421c-33bc-dcec8d734c64'},
    {id:44, name:'Wingman Sticky',        price:790,  desc:'5 Sticky wings + Reg. chips + 350ml drink', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/e74b4413-f1ba-0e50-ace6-a3c050d8ab1a.jpeg?a=1fbb9c66-ee30-a9d8-afd1-2ae910045660'},
    {id:45, name:'Wings Lunchbox',        price:850,  desc:'5 Zinger wings + chips + coleslaw + 350ml drink', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/3fe7e7b1-c1b6-9d2e-475b-5320062ca22f.jpeg?a=9ada9101-f598-6fbe-a167-958f9e1b6db9'},
  ],
  Sharing:[
    {id:46, name:'9 PC Bucket',           price:1900, desc:'9 pcs OR / Spicy chicken', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/7eba656f-6b3d-19e9-3c7d-23991f936728.jpeg?a=11207093-d788-7551-0368-63e1ff13a33b'},
    {id:47, name:'12 PC Bucket',          price:2450, desc:'12 pcs OR / Spicy chicken', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/0d34e7c2-7f21-ba83-b470-352d3a852314.jpeg?a=b176cf02-4e09-a1c2-fb52-790ee52e9f9b'},
    {id:48, name:'15 PC Bucket',          price:2900, desc:'15 pcs OR / Spicy chicken', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/2d8437bb-17d5-2b80-60a7-3d7b087d8836.jpeg?a=4dcdb9b8-9127-401b-14f6-d0c1f9b52629'},
    {id:49, name:'18 PC Bucket',          price:3250, desc:'18 pcs OR / Spicy chicken', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/2800a15b-ceb1-be1a-dde2-25b3454ec884.jpeg?a=7c6a5980-76a9-7ee6-3718-7391afd96f60'},
    {id:50, name:'21 PC Bucket',          price:3800, desc:'21 pcs OR / Spicy chicken', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/ae097312-5f48-beaa-72e7-c2e448709e53.jpeg?a=912a829a-1fc8-0907-9a36-21478747b18f'},
    {id:51, name:'Kentucky Bucket',       price:2550, desc:'11 pcs OR / Spicy + Family size chips', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/eb1ab60c-11f5-0f35-2113-5fcc001b99be.jpeg?a=22a49b49-74aa-c02d-5b34-cf73b1d3e6b7'},
    {id:52, name:'Colonel Bucket Feast',  price:2990, desc:'8 pcs + 2 Lrg chips + coleslaw + 2L drink + 4 wings', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/30925bca-5906-8944-5a78-2e1435091278.jpeg?a=45c840c6-b8e5-e1d6-72d5-15f4218ff938'},
    {id:53, name:'Bawa Bucket',           price:2200, desc:'16 Zinger Wings + Family chips + 1.25L drink', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/915e92bb-87d2-b564-a7d9-87909b17c2bc.jpeg?a=e4ced277-2bd5-f74a-47cd-d84288174780'},
    {id:54, name:'Sticky Bawa Bucket',    price:2500, desc:'16 Sticky Wings + Family chips + 1.25L drink', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/80d5f1d5-e458-e782-f273-cfddce9ccce8.jpeg?a=7f8316a0-2484-dacb-993b-1c41ec9e112d'},
  ],
  'Nuggets & Pops':[
    {id:55, name:'Chicken Bites 8 pc',    price:390, desc:'8 pcs tender chicken bites', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/b8ba0758-d52e-5a43-a7b7-57972462e1cf.jpeg?a=32f853eb-1103-77a3-519c-f4c3de4ff166'},
    {id:56, name:'Chicken Bites 16 pc',   price:600, desc:'16 pcs tender chicken bites', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/1bdbeeb8-6315-1ba0-fd86-d4081130aa0e.jpeg?a=18500b4c-5686-ccc1-1c1f-9d1f23fb338c'},
    {id:57, name:'Chicken Bites 24 pc',   price:790, desc:'24 pcs tender chicken bites', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/0a81ad4b-23d7-4183-d0fd-62926ec0ef45.jpeg?a=5737b088-096c-0bd2-0467-4f8f524261f7'},
    {id:58, name:'KFC Nuggets 8 pc',      price:390, desc:'8 pcs crispy chicken nuggets', img:'https://cdn.tictuk.com/051a03c6-fbab-ee7d-18b0-a92132fba348/8b7a145a-07a1-ece6-1bba-a2b732a039a9.jpeg?a=8c6e8f99-2abd-a597-ba76-956e34306aca'},
    {id:59, name:'KFC Nuggets 16 pc',     price:690, desc:'16 pcs crispy chicken nuggets', img:'https://cdn.tictuk.com/059c6a06-ad71-1fee-63b6-c78d1dabb058/8e79856a-04d8-6838-e042-acbf70108e7d.jpeg?a=9455943f-a868-0b88-194b-49c5ea980812'},
    {id:60, name:'KFC Nuggets 24 pc',     price:890, desc:'24 pcs crispy chicken nuggets', img:'https://cdn.tictuk.com/059c6a06-ad71-1fee-63b6-c78d1dabb058/2c2450ca-3bb2-c4fb-eb26-dbb6968aee4f.jpeg?a=c712c1c3-5ba6-92fa-44cf-ffda8c9ad5d6'},
    {id:61, name:'Pops Regular',          price:390, desc:'Regular pops chicken', img:'https://cdn.tictuk.com/051a03c6-fbab-ee7d-18b0-a92132fba348/36857b07-5970-0610-a41f-1102ac773dcc.jpeg?a=2c136b25-7f9f-7876-b275-b8738523af05'},
    {id:62, name:'Pops Large',            price:690, desc:'Large pops chicken', img:'https://cdn.tictuk.com/059c6a06-ad71-1fee-63b6-c78d1dabb058/ce800dca-2e6a-0406-6390-f8c36845e986.jpeg?a=1cf94994-4520-bb51-8592-1b80afd74a3d'},
  ],
  'Snacks & Sides':[
    {id:63, name:'3 Crispy Fillets',    price:490, desc:'3 crispy chicken fillets + 1 dip', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/0be83174-5ee6-7047-05f2-8d253e3a9b2b.jpeg?a=f0d9993f-f043-34a4-eb7f-ea2ab9f69d63'},
    {id:64, name:'6 Crispy Fillets',    price:890, desc:'6 crispy chicken fillets', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/2c198a58-d809-9673-cb4c-ecb01bbb2c6c.jpeg?a=cd8243fc-7de8-21f0-5f74-bf77f9c00783'},
    {id:65, name:'Crispy Strips Meal',  price:790, desc:'3 Crispy Strips + Dip + Reg. chips + 500ml drink', img:'https://cdn.tictuk.com/051a03c6-fbab-ee7d-18b0-a92132fba348/ad75c67d-1323-6d29-569f-d55a2c5f9dbb.jpeg?a=282ddf1d-443f-b864-de8f-f5e6a8c8ad04'},
    {id:66, name:'1 Piece Chicken',     price:290, desc:'1 pc Original Recipe chicken', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/b39c8366-4b64-1efe-a197-3971fec1e7a0.jpeg?a=bc67e266-237e-54cc-4c95-f096e62121a7'},
    {id:67, name:'Regular Chips',       price:290, desc:'Regular crispy KFC chips', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/4aa1f88d-0e1b-f7d0-424b-94400802bf87.jpeg?a=bc67e266-237e-54cc-4c95-f096e62121a7'},
    {id:68, name:'Large Chips',         price:290, desc:'Large portion crispy chips', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/4f7f0a4a-4159-7c62-35f6-1b2220b6167b.jpeg?a=c1974a1a-10e6-e981-ab6c-79ceb536ade5'},
    {id:69, name:'Family Chips',        price:590, desc:'Family size crispy chips', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/0838ced2-9f6c-1380-bc7e-b73894eb68dd.jpeg?a=bbffd18d-2738-770b-4b5c-d56f10b6dcf3'},
    {id:70, name:'Tortilla Chips',      price:200, desc:'Crispy tortilla chips', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/8d98c408-c8c9-f638-a149-5e131f329d53.jpeg?a=d4134b36-309a-2420-5f3e-92ac1a4ae23c'},
    {id:71, name:'Colonel Rice',        price:250, desc:'Seasoned yellow rice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/9c84250c-232f-6967-aaa8-21b9eb95192d.jpeg?a=8c8b2051-84ef-c2e0-0110-fb8b324d2944'},
    {id:72, name:'Coleslaw Small',      price:100, desc:'Small creamy KFC coleslaw', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/aed04276-4842-6e92-7d13-3b7521fed2b7.jpeg?a=95b7ba3d-4556-563a-1d93-d6562905f61b'},
    {id:73, name:'Coleslaw Regular',    price:270, desc:'Regular creamy KFC coleslaw', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/aed04276-4842-6e92-7d13-3b7521fed2b7.jpeg?a=95b7ba3d-4556-563a-1d93-d6562905f61b'},
    {id:74, name:'Coleslaw Large',      price:350, desc:'Large creamy KFC coleslaw', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/aed04276-4842-6e92-7d13-3b7521fed2b7.jpeg?a=95b7ba3d-4556-563a-1d93-d6562905f61b'},
  ],
  Drinks:[
    {id:75, name:'Soda 350ml',                 price:100, desc:'Coca-Cola, Sprite or Fanta — chilled', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/e36d00da-ec9f-9d47-3cb5-65c99b37b11f.jpeg?a=6c6073df-0046-1b57-4098-bbbb3e58c1c7'},
    {id:76, name:'Soda 500ml',                 price:150, desc:'Coca-Cola, Sprite or Fanta — chilled', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/17b775dd-887a-101c-0990-0c727defba6d.jpeg?a=42c02d15-a895-5cb6-8c55-127f74702b7f'},
    {id:77, name:'Soda 1.25L',                 price:330, desc:'Large Coca-Cola, Sprite or Fanta', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/00328365-9624-5ec6-00ce-a5f2bf8fa8b4.jpeg?a=d26d865e-2a6d-43c2-98df-08e1fc69c947'},
    {id:78, name:'Soda 2L',                    price:370, desc:'2 Litre Coca-Cola, Sprite or Fanta', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/0486bf0b-d0be-ab04-4ece-605420df9b8e.jpeg?a=66f7c23a-c889-a313-b828-e226f2b47967'},
    {id:79, name:'Dasani Water 500ml',         price:130, desc:'Chilled bottled water', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/f4989775-138d-304d-39ca-1ebf00397f73.jpeg?a=173ef253-0bac-c302-dc97-1714bdf92897'},
    {id:80, name:'Minute Maid Mango 400ml',    price:160, desc:'Chilled Minute Maid Mango juice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/d1a6c468-ef0f-4ef3-721f-ecb5bc447a2b.jpeg?a=fe6f7046-539d-804b-19da-41c0e22d97c2'},
    {id:81, name:'Minute Maid Apple 400ml',    price:160, desc:'Chilled Minute Maid Apple juice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/269397a7-49d0-519a-3ccb-53a69b4974bd.jpeg?a=ddbd42dc-a33b-18d6-9684-76d6c0d27cbd'},
    {id:82, name:'Minute Maid Tropical 400ml', price:160, desc:'Chilled Minute Maid Tropical juice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/dc7c4b48-a9a9-0dde-5fc6-5c24cd696be0.jpeg?a=37511ffe-071e-2b2c-90a1-83337a81a375'},
    {id:83, name:'Minute Maid Orange 400ml',   price:160, desc:'Chilled Minute Maid Orange juice', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/c67d64f7-1b7f-877e-e911-dc33d788e141.jpeg?a=ca1ed84f-be8c-5fa3-56f1-1969d5b74072'},
  ],
  Krushers:[
    {id:84, name:'Oreo Krusher',         price:350, desc:'Creamy Oreo blended Krusher', img:'https://cdn.tictuk.com/051a03c6-fbab-ee7d-18b0-a92132fba348/7b65b2b0-8eb4-cd7a-15c3-87c08faeb8d0.jpeg?a=1d7b3d7b-8e12-7d7f-755e-77b7879cce4e'},
    {id:85, name:'Strawberry Krusher',   price:350, desc:'Chilled Strawberry Krusher', img:'https://cdn.tictuk.com/051a03c6-fbab-ee7d-18b0-a92132fba348/7406d631-2daa-a108-354e-8c3aa87d1c23.jpeg?a=5c37924d-1065-37b0-550b-339eac5de50b'},
    {id:86, name:'Cheese Cake Krusher',  price:350, desc:'Creamy Cheese Cake Krusher', img:'https://glovo.dhmedia.io/image/menus-glovo/products/ec4ae52effafbe596592bc3d23a662c14ffb80cb7d02ae500a8b71d6d2aa232f?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:87, name:'Mixed Berry Krusher',  price:350, desc:'Chilled Mixed Berry Krusher', img:'https://glovo.dhmedia.io/image/menus-glovo/products/235b301cf75c6c3ddb52c7e3312fc6400d313bbd6a85d8e6df6cd00bb3559431?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:88, name:'Blueberry Krusher',    price:350, desc:'Chilled Blueberry Krusher', img:'https://glovo.dhmedia.io/image/menus-glovo/products/91cfe59a723117f36de6c99a3802ef704acdfa23b922a3aa043393c786203a10?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
  ],
  Desserts:[
    {id:89,  name:'Ice Lolly Passion',                  price:60,  desc:'Passion fruit flavoured ice lolly', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/69bdacd9-339f-4c28-44b7-e0b0e9bb8915.jpeg?a=911d0f50-5ebe-c7d9-b4e5-f8de9a302e0f'},
    {id:90,  name:'Ice Lolly',                          price:60,  desc:'Classic Pina Colada ice lolly', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/29eda04c-1d85-8430-084d-2763bd718cbe.jpeg?a=b52dc288-b370-971f-de9d-dcfbf2a5e517'},
    {id:91,  name:'Soft Twirl',                         price:150, desc:'Classic soft serve ice cream cone', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/619a8350-0b6c-a65e-a4ef-8153cba68cb4.jpeg?a=d34bcf34-6fbb-89f3-e541-7a9fd542859d'},
    {id:92,  name:'Salted Caramel Ice Cream 250ml',     price:290, desc:'Salted caramel ice cream tub 250ml', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/e5637453-0c27-815f-ef7e-c0df4a883bd8.jpeg?a=451513c7-a1fa-c8f5-0e2b-b3bbb0dbc641'},
    {id:93,  name:'Cookies & Cream Ice Cream 250ml',    price:290, desc:'Cookies & cream ice cream tub 250ml', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/e67a13c4-1c93-0217-5b1a-2d898196a289.jpeg?a=b68cee09-2aee-9fa4-9aa2-1a917fad5ab8'},
    {id:94,  name:'Vanilla Choc Chip Ice Cream 250ml',  price:290, desc:'Vanilla choc chip ice cream tub 250ml', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/dc708884-71fe-acf4-6edb-d94095f84b56.jpeg?a=faf1a63b-5e2e-3616-1fa3-5c3f3a0efd35'},
    {id:95,  name:'Salted Caramel Ice Cream 750ml',     price:550, desc:'Salted caramel ice cream tub 750ml', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/c7d6c548-e25b-17c0-ad0d-d1e1c75ce60a.jpeg?a=3711e346-d282-c6f0-9c63-82bdc4ae1787'},
    {id:96,  name:'Cookies & Cream Ice Cream 750ml',    price:550, desc:'Cookies & cream ice cream tub 750ml', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/ac84ebd3-6b06-22be-07c3-fcac6fd29bd3.jpeg?a=322ecaf5-b2db-25ce-5f3a-b1f652429068'},
    {id:97,  name:'Vanilla Choc Chip Ice Cream 750ml',  price:550, desc:'Vanilla choc chip ice cream tub 750ml', img:'https://cdn.tictuk.com/174eef87-5a5a-dc2e-edbf-611f0131dfe8/c891af60-40ef-02cd-3cc6-01e37b04ab5a.jpeg?a=1e8c6be5-5725-629e-0d3c-41eb276af531'},
  ],
  Kiddie:[
    {id:98,  name:'Kiddie Meal 1', price:490, desc:'6 Nuggets + Reg. chips + 350ml soda', img:'https://glovo.dhmedia.io/image/menus-glovo/products/95395b9c31f3cf0e63a4a5cf5830eccc55fd46485612fb1aaf397636d815c7a1?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:99,  name:'Kiddie Meal 2', price:450, desc:'1 pc Chicken + Reg. chips + 350ml soda', img:'https://glovo.dhmedia.io/image/menus-glovo/products/52d98da6cffc9931be62ca6551d8b7b4f727b39eeeda36ba0000e4d5c104a1c4?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:100, name:'Kiddie Meal 3', price:550, desc:'20 Pops + Reg. chips + 350ml soda', img:'https://glovo.dhmedia.io/image/menus-glovo/products/73ff0591c9e74c1d6ff2e8f44ee9cd8fa70d9bcf7d4aa8136c224579f23e8a11?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
  ],
  Dipping:[
    {id:101, name:'Dipping Box',                 price:1990, desc:'6 Wings + 6 Strips + 12 Nuggets + Lrg chips + 3 dipping sauces', img:'https://glovo.dhmedia.io/image/menus-glovo/products/41940fa143d81d7ae2daef32e43b7395dc289902db6458edc5fbf3ad9c2c3fcf?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
    {id:102, name:'Dipping Box With 1.25L Soda', price:2200, desc:'6 Wings + 6 Strips + 12 Nuggets + Lrg chips + 1.25L soda + 3 dipping sauces', img:'https://glovo.dhmedia.io/image/menus-glovo/products/e63722651372325e893d134dfdebb451a2808b70a83110fa138f6a27b1599576?t=W3sucmVzaXplIjp7Im1vZGUiOiJmaXQiLCJ3aWR0aCI6MzIwLCJoZWlnaHQiOjMyMH19XQ=='},
  ],
};

// MIGRATE — flatten MENU into rows and insert into Supabase

async function migrate() {
  console.log('🚀 Starting menu migration...');

  const rows = Object.entries(MENU).flatMap(([category, items]) =>
    items.map(item => ({
      name:        item.name,
      category:    category,
      price:       item.price,
      description: item.desc || null,
      img:         item.img || null,
      available:   true
    }))
  );

  console.log(`📦 Inserting ${rows.length} menu items...`);

  const { data, error } = await supabase
    .from('menu_items')
    .insert(rows)
    .select();

  if (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }

  console.log(`✅ Successfully inserted ${data.length} menu items into Supabase!`);
  process.exit(0);
}

migrate();
