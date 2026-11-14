import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateUser } from '@/api/endpoints';
import { queryKeys } from '@/api/queryKeys';
import type { UserUpdateDto } from '@/api/types';

interface UpdateProfileInput extends UserUpdateDto {
  userId: number;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, ...payload }: UpdateProfileInput) => updateUser(userId, payload),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.currentUser, user);
      // allauth's `display` comes from the name too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}
