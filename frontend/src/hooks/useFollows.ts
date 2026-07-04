import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userService } from '@/services/userService'
import { useWatchlist } from '@/providers'

export function useFollows() {
  const { setFollows } = useWatchlist()
  const queryClient = useQueryClient()

  const followsQuery = useQuery({
    queryKey: ['user-follows'],
    queryFn: async () => {
      const data = await userService.getFollows()
      setFollows(data)
      return data
    },
  })

  const followMutation = useMutation({
    mutationFn: userService.followCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-follows'] })
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: userService.unfollowCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-follows'] })
    },
  })

  return { followsQuery, followMutation, unfollowMutation }
}
