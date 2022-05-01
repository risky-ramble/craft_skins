import { PublicKey } from '@solana/web3.js';

export const recipe_nft_data = (creator: PublicKey) => {
  return {
    name: 'Risky Ramble :: Test Recipe',
    symbol: 'TEST',
    description: 'Test Recipe for Risky Ramble skins',
    seller_fee_basis_points: 1000,
    image: 'https://eye-of-eleriah.s3.us-west-1.amazonaws.com/3-lock.png',
    collection: { name: 'Risky Ramble Recipes', family: 'Risky Ramble' },
    properties: {
      files: [
        {
          uri: 'https://eye-of-eleriah.s3.us-west-1.amazonaws.com/3-lock.png',
          type: 'image/png',
        },
      ],
      category: 'image',
      creators: [
        {
          address: creator,
          share: 100,
        },
      ],
    },
  };
};

export const recipe_json_url = "https://discord-creatures.s3.eu-west-3.amazonaws.com/TheMalformed.json";

export const skin_data = (creator: PublicKey) => {
  return {
      "name": "Risky Ramble :: Test Skin",
      "symbol": "SKIN",
      "description": "Test skin :: semi-fungible token",
      "image": "https://eye-of-eleriah.s3.us-west-1.amazonaws.com/13-lock.png",
      "external_url": "https://twitter.com/RiskyRamble",
      "attributes": [
        {
          "trait_type": "Rarity",
          "value": "Common"
        },
        {
          "trait_type": "Recipe",
          "value": "50 elimination tokens + 1 winner royale"
        },
        {
          "trait_type": "Epoch",
          "value": "S1-E1"
        }
      ]
    }
};

export const skin_json_url = "https://discord-creatures.s3.eu-west-3.amazonaws.com/Pod.json";