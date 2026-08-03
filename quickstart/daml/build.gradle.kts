// Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: 0BSD

buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath(Deps.transcode.plugin)
    }
}

plugins {
    id("base")
    id("de.undercouch.download") version "5.6.0"
}

tasks.register<Exec>("compileDaml") {
    val requiredVersion = VersionFiles.damlYamlSdk
    commandLine("dpm", "build", "--all")
    environment("DPM_SDK_VERSION", requiredVersion)
}

tasks.register<Exec>("testDaml") {
    val requiredVersion = VersionFiles.damlYamlSdk
    commandLine("dpm", "test", "--package-root", "leasing-tests")
    environment("DPM_SDK_VERSION", requiredVersion)
}

tasks.register<com.digitalasset.transcode.codegen.java.gradle.JavaCodegenTask>("codeGen") {
    dar.from("$projectDir/leasing/.daml/dist/quickstart-leasing-0.0.1.dar")
    // The token standard DARs are listed here as well as in leasing/daml.yaml. A DAR
    // only carries the dependencies its own code actually uses, and Leasing.Lease uses
    // none of them yet — so without these lines the bindings that ChoiceContextUtils
    // and Utils import (AnyValue, RelTime) would not be generated and the backend
    // would not compile. Once the leasing templates use the token standard, the DAR
    // will carry them on its own and these lines become redundant.
    dar.from(
        "$projectDir/dars/splice-api-token-metadata-v1-1.0.0.dar",
        "$projectDir/dars/splice-api-token-holding-v1-1.0.0.dar",
        "$projectDir/dars/splice-api-token-allocation-v1-1.0.0.dar",
        "$projectDir/dars/splice-api-token-allocation-request-v1-1.0.0.dar"
    )
    destination = file("$rootDir/backend/build/generated-daml-bindings")
    dependsOn("compileDaml")
}

tasks.named("build") {
    dependsOn("codeGen")
}
