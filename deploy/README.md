# Deployment

A note on where this sits, because the sibling tools do it differently. Neither
the Antigen Density Calculator nor the Molarity Converter keeps deployment
config in its repository; both are deployed from outside. C4 keeps it here so
that the deployment is reproducible from the repository and so that a deploy can
be triggered without a machine that has credentials on it. If the tool set later
settles on a single convention, this is the thing to reconcile.

## The shape

The suite serves every tool from one origin, with a router Worker per tool:

    benchtools.ligant.ai/antibody-titration-planner/*
      -> Worker "ligant-antibody-titration-planner-router"   (strips the prefix)
      -> ligant-antibody-titration-planner.pages.dev/*

`router/index.js` is the same code as `ligant-molarity-converter-router` with
the prefix and upstream changed.

The site is built with a RELATIVE base, so it works under the path prefix,
directly on the `pages.dev` host, from any static server, and from a disk with
no server at all.

## Credentials

`.github/workflows/deploy.yml` needs two repository secrets:

| Secret | Where |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com, My Profile, API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | the Cloudflare dashboard sidebar |

The token needs three permissions, and no more:

- Account, Cloudflare Pages, Edit
- Account, Workers Scripts, Edit
- Zone, Workers Routes, Edit, on `ligant.ai`

The first alone is enough to publish the site. The second and third are needed
only to deploy the router, which is a one-time step.

## Deploying

The workflow runs `npm run verify` before it publishes anything, so a build that
fails the privacy scan, the tests or the browser check cannot reach the site.

- **On every push to `main`**: builds and publishes to Pages.
- **Manually**, from the Actions tab or the API, with two switches:
  - `deploy_router`, needed once, to bind `benchtools.ligant.ai`.
  - `verify_deployed`, to run acceptance test 17 against the live address.

## Acceptance test 17

    node scripts/check-network.mjs https://benchtools.ligant.ai/antibody-titration-planner/

This is the half a local run cannot satisfy: a server over `dist/` does not
exercise the host or its CDN, and cannot see anything a host inserts into a
response afterwards. It must print `ACCEPTANCE TEST 17: PASSED`.

ONLY THEN set `NETWORK_CLAIM_VERIFIED = true` in `src/lib/site.ts`, and deploy
again. Until it is set, the footer states the weaker claim that is actually
established, which is correct rather than provisional. `check-network.mjs`
refuses to let the strong claim go live on the strength of a local run.

Re-run it after any redeployment or CDN configuration change.
