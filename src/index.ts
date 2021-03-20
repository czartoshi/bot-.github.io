import axios from 'axios';
import ccxt from 'ccxt';
import { IConfig } from './models/config.model';

require('dotenv').config;

const isProduction = true;

const tick = async (binanceClient: ccxt.binanceus, config: IConfig) => {
    const { asset, base, spread, allocation } = config;
    const market = `${asset}/${base}`;

    const orders: ccxt.Order[] = await binanceClient.fetchOpenOrders(market);
    if (orders.length) {
        for (let i = 0; i < orders.length; i++) {
            await binanceClient.cancelOrder(orders[i].id, orders[i].symbol)
                .then(() => console.log(`Order cancelled - ID: ${orders[i].id}, Symbol: ${orders[i].symbol}`))
                .catch(() => {});
        }
    } else {
        console.log('There are currently no open orders');
    }

    const results = await Promise.all([
        axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'),
        axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd'),
    ]);

    const marketPrice = results[0].data.bitcoin.usd / results[1].data.tether.usd;
    const sellPrice = marketPrice * (1 + spread);
    const buyPrice = marketPrice * (1 - spread);
    const balances = await binanceClient.fetchBalance();
    const assetBalance = balances.free[asset];
    const baseBalance = balances.free[base];
    const sellVolume = assetBalance * allocation;
    const buyVolume = (baseBalance * allocation) / marketPrice;

    // console.log(`New tick for ${market}...`);

    if (sellVolume > 0) {
        await binanceClient.createLimitOrder(market, 'sell', sellVolume, sellPrice)
            .then(() => console.log(`Created limit sell order for ${sellVolume}@${sellPrice}`))
            .catch(() => {});
    }

    if (buyVolume > 0) {
        await binanceClient.createLimitOrder(market, 'buy', buyVolume, buyPrice)
            .then(() => console.log(`Created limit buy order for ${buyVolume}@${buyPrice}`))
            .catch(() => {});
    }
}

const run = () => {
    const config: IConfig = {
        asset: 'BTC',
        base: 'USD',
        allocation: 0.1,
        spread: 0.1,
        tickInterval: 5000
    };

    const binanceClient = new ccxt.binanceus({
        apiKey: process.env.API_KEY,
        secret: process.env.API_SECRET,
        enableRateLimit: true,
        verbose: false
    });

    tick(binanceClient, config);
    setInterval(tick, config.tickInterval, binanceClient, config);
}

run();
