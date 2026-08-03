// Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: 0BSD

package com.digitalasset.quickstart.repository;

import com.digitalasset.quickstart.pqs.Contract;
import com.digitalasset.quickstart.pqs.Pqs;
import com.digitalasset.transcode.java.ContractId;
import com.digitalasset.transcode.java.Template;
import com.digitalasset.transcode.java.Utils;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

/**
 * Reads active Daml contracts out of PQS.
 * <p>
 * No queries yet: this held upstream's licensing queries, which went with the rest of
 * that demo, and the leasing model has no contracts to query yet. What is left is the
 * wiring and the extraction helpers, so the first leasing query has somewhere to go.
 * <p>
 * For the straightforward cases, prefer {@link Pqs} directly — {@code pqs.active(X.class)}
 * for every active contract of a template, {@code pqs.contractByContractId(X.class, cid)}
 * for one by id. This class earns its keep when a query needs SQL that PQS does not
 * generate for you: a join across templates, a filter the database should do rather than
 * the JVM, an aggregate. In that case run the SQL through {@code pqs}, then turn each row
 * into a typed {@link Contract} with the helpers below. Upstream's version joined licenses
 * to their renewal requests and allocations that way — worth reading out of git history if
 * you want the pattern in full.
 */
@Repository
public class DamlRepository {

    private final Pqs pqs;

    @Autowired
    public DamlRepository(Pqs pqs) {
        this.pqs = pqs;
    }

    protected Pqs pqs() {
        return pqs;
    }

    /** Decodes a JSON payload column into a template's generated Java class. */
    protected <T extends Template> T extractPayload(Class<T> clazz, String payload) {
        return clazz.cast(pqs.getJson2Dto().template(Utils.getTemplateIdByClass(clazz)).convert(payload));
    }

    /** Pairs a contract id with its decoded payload, as PQS rows come back. */
    protected <T extends Template> Contract<T> extract(Class<T> clazz, ContractId<T> cid, String payload) {
        return new Contract<>(cid, extractPayload(clazz, payload));
    }

    /** Types a contract id column, for a join where the row may not have one. */
    protected <T extends Template> Optional<ContractId<T>> optionalCid(Class<T> clazz, String cid) {
        return Optional.ofNullable(cid).map(ContractId<T>::new);
    }

    /** Types a contract id column. */
    protected <T extends Template> ContractId<T> cid(Class<T> clazz, String cid) {
        return new ContractId<T>(cid);
    }

    /** The template's fully qualified Daml name, which is how PQS names its views. */
    protected <T extends Template> String qualifiedName(Class<T> clazz) {
        return Utils.getTemplateIdByClass(clazz).qualifiedName();
    }
}
