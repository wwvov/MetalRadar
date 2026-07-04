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
      // 关注变更后刷新所有新闻列表，使"关注公司"Tab 等及时更新
      queryClient.invalidateQueries({ queryKey: ['news'] })
    },
  })

  const unfollowMutation = useMutation({
    mutationFn: userService.unfollowCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-follows'] })
      queryClient.invalidateQueries({ queryKey: ['news'] })
    },
  })

  return { followsQuery, followMutation, unfollowMutation }
}
