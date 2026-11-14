import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateUser } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import type { UserUpdateDto } from '@/api/types';

interface UpdateProfileInput extends UserUpdateDto {
  userId: number | null;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, ...payload }: UpdateProfileInput) => {
      if (userId === null) {
        return Promise.reject(
          new ApiError({ kind: 'parse', message: 'Your account id could not be determined. Reload and try again.' }),
        );
      }
      return updateUser(userId, payload);
    },
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.currentUser, user);
    },
  });
}
