# Probability Lab · Teaching Edition

Follow a single draw through a Bayesian model. Click a node to inspect its distribution, then change the draw to see which values move together. Both examples use synthetic observations and run in your browser.

**[Try the interactive lab](https://essencesentry.github.io/probability-lab-teaching/)**

- **[Coin tosses](https://essencesentry.github.io/probability-lab-teaching/?model=coin)**. Select the bias node. Under **Canvas options → Saved run**, compare 7 heads in 10 tosses with 70 in 100. The observed proportion is the same. How does the extra evidence change the uncertainty about the next ten tosses?
- **[Partial pooling](https://essencesentry.github.io/probability-lab-teaching/?model=pooling)**. The first two groups both average 0.6, from 2 and 40 observations respectively. Select the group location node and compare coordinates `[0]` and `[1]` to see how sample size changes the pull toward the shared population.

![Coin tosses in Probability Lab with the model graph and distribution inspector.](docs/coin-model.webp)

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

To serve the production build, run `npm run build` and `npm run preview`.

## Inspect the models

Each bundle contains the NumPyro model definition, its variables and the saved draws shown in the explorer. The coin example uses a beta-binomial model. The pooling example uses a shared normal population and a known within-group standard deviation. Each posterior run contains draws from the corresponding exact posterior.

[Coin model and draws](src/programs/coin.json) · [Partial pooling model and draws](src/programs/pooling.json)
