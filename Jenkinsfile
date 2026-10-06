// cf-pipeline-lab — Jenkinsfile
//
// Lab version of the company's Cloudflare pipeline mechanics: one small Astro/Workers
// app instead of many brands, but the same core idea. Two separate things decide the
// outcome of a build:
//   - the git BRANCH decides WHERE THE CODE COMES FROM (Jenkins reads this itself)
//   - CLOUDFLARE_ENV (develop | branch | release) decides WHICH wrangler.jsonc env
//     block the build uses — the Worker's name, domain and KV namespace
// This file derives CLOUDFLARE_ENV FROM the branch, same as the company pipeline:
//   branch == 'develop'                  -> CLOUDFLARE_ENV=develop (writes the shared KV)
//   any other branch                     -> CLOUDFLARE_ENV=branch  (reads the shared KV)
//   DEPLOY_TARGET=beta/production (manual, develop only) -> CLOUDFLARE_ENV=release
//
// EDIT THIS before first run:
env.LAB_DOMAIN = 'grona.online'   // <-- your own domain from Cloudflare

pipeline {
    agent any

    parameters {
        // Mirrors the company's DEPLOY_TARGET: staging is automatic (derived from the
        // branch below), beta/production are a deliberate manual choice. 'staging' here
        // means "let the branch decide" — it is NOT a wrangler env name by itself.
        choice(
            name: 'DEPLOY_TARGET',
            choices: ['staging', 'beta', 'production'],
            description: 'staging = auto, derived from the branch. beta/production = manual promotion.'
        )
    }

    options {
        disableConcurrentBuilds()
    }

    environment {
        // node:22.22.0-bookworm-slim is the same image family the company's
        // Cloudflare pipeline pins (BUILD_IMAGE) — keeping it here for consistency.
        BUILD_IMAGE  = 'node:22.22.0-bookworm-slim'
        PNPM_VERSION = '11.5.2'
    }

    stages {

        // ---- 1. Work out WHERE this build deploys to --------------------------------
        // Same shape as arcticCrownInit(): CLOUDFLARE_ENV decides the tier, which decides
        // the Worker name and domain. No change-gate / monorepo logic here — this repo
        // has only one app, so every push is relevant.
        stage('Init: worker identity') {
            steps {
                script {
                    // A single-branch Pipeline job (what we have here) reports the branch
                    // via GIT_BRANCH as "origin/develop", not "develop" — only a Multibranch
                    // Pipeline job would set BRANCH_NAME without the remote prefix. Strip it
                    // so branch == 'develop' actually matches.
                    def rawBranch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'local'
                    def branch    = rawBranch.replaceFirst(/^origin\//, '')
                    def slug      = branch.toLowerCase()
                        .replaceAll('[^a-z0-9-]', '-')
                        .replaceAll('-+', '-')
                        .replaceAll('^-|-$', '')
                    boolean isDevelop = (branch == 'develop')

                    // beta/production are a deliberate manual action — only allowed from
                    // develop, same rule as the company pipeline's DEPLOY_TARGET guard.
                    if (params.DEPLOY_TARGET != 'staging' && !isDevelop) {
                        error("DEPLOY_TARGET=${params.DEPLOY_TARGET} is only allowed from the 'develop' branch (current: '${branch}').")
                    }

                    if (params.DEPLOY_TARGET == 'production') {
                        env.CLOUDFLARE_ENV = 'release'
                        env.CF_TIER        = 'prod'
                        env.WORKER_NAME    = 'lab-xsite-prod'
                        env.WORKER_DOMAIN  = "www.${env.LAB_DOMAIN}"
                    } else if (params.DEPLOY_TARGET == 'beta') {
                        env.CLOUDFLARE_ENV = 'release'
                        env.CF_TIER        = 'beta'
                        env.WORKER_NAME    = 'lab-xsite-beta'
                        env.WORKER_DOMAIN  = "beta.${env.LAB_DOMAIN}"
                    } else if (isDevelop) {
                        // staging + branch == develop -> the ONE writer of the shared KV
                        env.CLOUDFLARE_ENV = 'develop'
                        env.CF_TIER        = 'stg'
                        env.WORKER_NAME    = 'develop-lab-xsite-stg'
                        env.WORKER_DOMAIN  = "${env.WORKER_NAME}.${env.LAB_DOMAIN}"
                    } else {
                        // staging + any other branch -> reads the shared KV, no cron
                        env.CLOUDFLARE_ENV = 'branch'
                        env.CF_TIER        = 'stg'
                        env.WORKER_NAME    = "${slug}-lab-xsite-stg"
                        env.WORKER_DOMAIN  = "${env.WORKER_NAME}.${env.LAB_DOMAIN}"
                    }

                    env.BUILD_BRANCH = branch
                    currentBuild.description =
                        "${branch} · ${env.CLOUDFLARE_ENV} · ${env.WORKER_NAME} · ${env.WORKER_DOMAIN}"

                    echo "branch=${branch}  DEPLOY_TARGET=${params.DEPLOY_TARGET}  " +
                         "CLOUDFLARE_ENV=${env.CLOUDFLARE_ENV}  TIER=${env.CF_TIER}  " +
                         "WORKER_NAME=${env.WORKER_NAME}  WORKER_DOMAIN=${env.WORKER_DOMAIN}"
                }
            }
        }

        // ---- 2. Install dependencies -------------------------------------------------
        // Same trick as run.sh: run pnpm inside a throwaway Node container so nothing
        // needs to be installed on the Jenkins agent itself.
        stage('Install') {
            steps {
                script {
                    docker.image(env.BUILD_IMAGE).inside {
                        sh "npx -y pnpm@${env.PNPM_VERSION} install --frozen-lockfile"
                    }
                }
            }
        }

        // ---- 3. Build for the chosen wrangler env -------------------------------------
        stage('Build') {
            steps {
                script {
                    docker.image(env.BUILD_IMAGE).inside {
                        withEnv([
                            "CLOUDFLARE_ENV=${env.CLOUDFLARE_ENV}",
                            "PUBLIC_BUILD_BRANCH=${env.BUILD_BRANCH}",
                            "PUBLIC_DEPLOY_TIER=${env.CF_TIER}",
                            "PUBLIC_BUILD_TIME=${sh(script: 'date -u +%FT%TZ', returnStdout: true).trim()}"
                        ]) {
                            sh "npx -y pnpm@${env.PNPM_VERSION} build"
                        }
                    }
                }
            }
        }

        // ---- 4. Guard: did the build actually resolve the env we asked for? -----------
        // This is the check the company Jenkinsfile does with grep on
        // dist/.../server/wrangler.json's targetEnvironment — a build that silently
        // falls back to the top-level config (cold, unshared KV) would pass the build
        // step but deploy something wrong.
        stage('Check target env') {
            steps {
                script {
                    docker.image(env.BUILD_IMAGE).inside {
                        withEnv(["CLOUDFLARE_ENV=${env.CLOUDFLARE_ENV}"]) {
                            sh 'node scripts/check-target-env.mjs'
                        }
                    }
                }
            }
        }

        // ---- 5. Deploy ------------------------------------------------------------
        // Credentials are injected only for this stage, same reasoning as the company
        // pipeline's withCredentials around its wrangler deploy step.
        stage('Deploy') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'cloudflare-token',      variable: 'CLOUDFLARE_API_TOKEN'),
                        string(credentialsId: 'cloudflare-account-id', variable: 'CLOUDFLARE_ACCOUNT_ID')
                    ]) {
                        docker.image(env.BUILD_IMAGE).inside {
                            // dist/server/wrangler.json is already flattened for one specific
                            // env — clear CLOUDFLARE_ENV here so wrangler doesn't try (and fail)
                            // to re-resolve an env block that no longer exists in this file.
                            withEnv(['CLOUDFLARE_ENV=']) {
                            sh """
                                npx -y pnpm@${env.PNPM_VERSION} dlx wrangler deploy \
                                  -c dist/server/wrangler.json \
                                  --name ${env.WORKER_NAME} \
                                  --domain ${env.WORKER_DOMAIN}
                            """
                            }
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Deployed: https://${env.WORKER_DOMAIN}"
        }
        always {
            echo "Build: ${env.BUILD_BRANCH ?: '(unknown)'} (${env.CLOUDFLARE_ENV ?: '?'}) → ${env.WORKER_NAME ?: '(not resolved)'}"
        }
    }
}