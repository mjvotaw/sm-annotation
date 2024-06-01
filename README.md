# SMEditor

This is a fork of [SMEditor](https://tillvit.github.io/smeditor), created to aid in building a database of good step annotation data for doing some Smart Math Stuff with it in the near future.

See [STEPANNOTATION.md](STEPANNOTATION.md) for details on how it works.

#### What is "parity"?

In this context, the "parity" data is additional data for a stepchart, that is used to describe the specific foot placement of the player for a given note in a chart. There's probably a better descriptor for this, but I haven't thought of one.

#### How does the parity generator work?

At a high level, it generates a graph of all possible foot placements for each note in a song. These foot placements are nodes in the graph, connected to each other. For each connection, there is a cost that's calculated (it's roughly analogous to the difficulty of moving from one given foot placement to another). We then find the cheapest path from the beginning to the end of the graph, which results in the "best" foot placement for each note of the song.

The cost is calculated by a [bunch of math](app/src/util/ParityCost.ts) and a series of pre-defined weights. These weights are what I'm hoping to refine in order to produce better results.

#### Why are you collecting this?

The parity generator in its current state does, like, an A- job overall. It's pretty good! But there are a lot of common step patterns that it tends to get wrong, and I want to try to fix that. 

#### Okay cool, but like, how?

I'm still working on that. But I know that I'm gonna need a lot of data.


# Building/Testing

1. Clone the repository
2. Install the required modules by running `npm install`
3. Build the website with `npm run build` or start a dev web server with `npm run dev`
4. Build the native app with `npm run app-build` or run the app with `npm run app-dev` (use `npm run dev` first)
