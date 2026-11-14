import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/errors';
import { toFormErrors } from './apiForm';

describe('toFormErrors', () => {
  it('maps shown fields and keeps other messages at form level', () => {
    const error = new ApiError({
      kind: 'http',
      status: 400,
      message: 'The request was not accepted.',
      fieldErrors: { name: ['Taken.'], selected_organizations: ['Must belong to this tenant.'] },
    });
    expect(toFormErrors(error, ['name'])).toEqual({
      fields: { name: 'Taken.' },
      form: 'Must belong to this tenant.',
    });
  });

  it('uses the error message when there are no field errors (e.g. 403)', () => {
    const error = new ApiError({ kind: 'http', status: 403, message: 'You cannot assign this role.' });
    expect(toFormErrors(error, ['role'])).toEqual({ fields: {}, form: 'You cannot assign this role.' });
  });

  it('handles non-API errors', () => {
    expect(toFormErrors(new Error('boom'), [])).toEqual({ fields: {}, form: 'boom' });
  });
});
