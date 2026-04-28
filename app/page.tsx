// // SPDX-License-Identifier: Apache-2.0


import { Suspense } from 'react';
import RefiAppClient from './RefiAppClient';
export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RefiAppClient />
    </Suspense>
  );
}