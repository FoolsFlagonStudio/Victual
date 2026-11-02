// Every API call goes through `request`. It normally hits the backend, but can
// hand a route to the in-app mock (src/api/mock) - see src/config/features.ts:
// - mockMealPlans: meal plan + grocery routes are simulated on the device
//   (using your real recipes) until the backend's generator exists.
// - demoMode: every route is simulated with sample data; no backend needed.
import { features } from '@/config/features';
import { httpRequest, type RequestOptions } from './http';
import { mockHandles, mockRequest } from './mock/server';

export { ApiError, query } from './http';
export type { RequestOptions } from './http';

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (features.demoMode || (features.mockMealPlans && mockHandles(path))) {
    return mockRequest<T>(path, opts);
  }
  return httpRequest<T>(path, opts);
}
