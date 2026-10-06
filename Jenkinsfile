// cf-pipeline-lab — Jenkinsfile
//
// Lab version of the company's Cloudflare pipeline mechanics: one small Astro/Workers
// app instead of many brands, but the same core idea —
//   CLOUDFLARE_ENV (develop | branch | release) decides which wrangler.jsonc env block
//   gets used, which in turn decides the Worker's name, domain and KV namespace.
//
// EDIT THIS before first run:
env.LAB_DOMAIN = 'grona.online'   // <-- your own domain from Cloudflare

pipeline {
    agent any

    parameters {
        // Matches the job's own parameter, but redeclaring it here means the Jenkinsfile
        // stays the single source of truth if this pipeline is ever reused for another job.
        choice(
            name: 'CLOUDFLARE_ENV',
            choices: ['develop', 'branch', 'release'],
            description: 'Which wrangler env block to build/deploy'
        )
        // Only used when CLOUDFLARE_ENV = release — mirrors the company's
        // DEPLOY_TARGET (beta/production) being a deliberate, manual choice.
        choice(
            name: 'RELEASE_TIER',
            choices: ['beta', 'production'],
            description: 'Only used when CLOUDFLARE_ENV=release'
        )
    }

    options {
        timestamps()
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
                    def branch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'local'
                    def slug   = branch.toLowerCase()
                        .replaceAll('[^a-z0-9-]', '-')
                        .replaceAll('-+', '-')
                        .replaceAll('^-|-$', '')

                    if (params.CLOUDFLARE_ENV == 'release') {
                        env.CF_TIER      = (params.RELEASE_TIER == 'production') ? 'prod' : 'beta'
                        env.WORKER_NAME  = "lab-xsite-${env.CF_TIER}"
                        env.WORKER_DOMAIN = (env.CF_TIER == 'prod')
                            ? "www.${env.LAB_DOMAIN}"
                            : "beta.${env.LAB_DOMAIN}"
                    } else if (params.CLOUDFLARE_ENV == 'develop') {
                        env.CF_TIER       = 'stg'
                        env.WORKER_NAME   = "develop-lab-xsite-stg"
                        env.WORKER_DOMAIN = "${env.WORKER_NAME}.${env.LAB_DOMAIN}"
                    } else { // branch
                        env.CF_TIER       = 'stg'
                        env.WORKER_NAME   = "${slug}-lab-xsite-stg"
                        env.WORKER_DOMAIN = "${env.WORKER_NAME}.${env.LAB_DOMAIN}"
                    }

                    env.BUILD_BRANCH = branch
                    currentBuild.description =
                        "${params.CLOUDFLARE_ENV} · ${env.WORKER_NAME} · ${env.WORKER_DOMAIN}"

                    echo "CLOUDFLARE_ENV=${params.CLOUDFLARE_ENV}  TIER=${env.CF_TIER}  " +
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
                            "CLOUDFLARE_ENV=${params.CLOUDFLARE_ENV}",
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
                        withEnv(["CLOUDFLARE_ENV=${params.CLOUDFLARE_ENV}"]) {
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

    post {
        success {
            echo "Deployed: https://${env.WORKER_DOMAIN}"
        }
        always {
            echo "Build: ${params.CLOUDFLARE_ENV} → ${env.WORKER_NAME ?: '(not resolved)'}"
        }
    }
}