// Copyright (c) 2026, Digital Asset (Switzerland) GmbH and/or its affiliates. All rights reserved.
// SPDX-License-Identifier: 0BSD

import OpenAPIClientAxios, { type Document } from 'openapi-client-axios';
import openApi from '../../common/openapi.yaml'

const api: OpenAPIClientAxios = new OpenAPIClientAxios({
    definition: openApi as Document,
    withServer: { url: '/api' },
});

api.init();

export default api;
